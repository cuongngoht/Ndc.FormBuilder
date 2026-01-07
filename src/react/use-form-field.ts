import * as React from "react";
import { NdcFormContext } from "../core/ndc-form.context";
import type {
  AnyValidator,
  FieldPath,
  FieldPathValue,
  LegacyValidator,
} from "../core/ndc-form.types";

/* ============================================================
 * Return type
 * ============================================================
 */

type FieldState<T> = {
  name: string;
  value: T | undefined;
  error: string | null;
  setValue(value: T): void;
  validate(): string | null;
};

/* ============================================================
 * Overloads
 * ============================================================
 */

// 🔹 LEGACY – code
export function useFormField<TValue>(opts: {
  name: string;
  initialValue: TValue;
  validators?: readonly LegacyValidator<TValue>[];
}): FieldState<TValue>;

// 🔹 TYPED
export function useFormField<TShape, P extends FieldPath<TShape>>(opts: {
  name: P;
  initialValue: FieldPathValue<TShape, P>;
  validators?: readonly AnyValidator<FieldPathValue<TShape, P>, TShape>[];
}): FieldState<FieldPathValue<TShape, P>>;

/* ============================================================
 * Implementation (shared)
 * ============================================================
 */

export function useFormField(opts: {
  name: string;
  initialValue: unknown;
  validators?: readonly unknown[];
}): FieldState<unknown> {
  const ctx = React.useContext(NdcFormContext);
  if (!ctx) throw new Error("Missing form context");

  const { api } = ctx;
  const { name, initialValue, validators } = opts;

  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

  React.useEffect(() => {
    api.register(name as any, initialValue as any);
    if (validators) api.setValidators(name as any, validators as any);
    return () => api.unregister(name as any);
  }, [api, name]);

  React.useEffect(
    () => api.subscribeValue(name as any, forceUpdate),
    [api, name]
  );
  React.useEffect(
    () => api.subscribeError(name as any, forceUpdate),
    [api, name]
  );

  return {
    name,
    value: api.getValue(name as any),
    error: api.getError(name as any),
    setValue(value) {
      api.setValue(name as any, value as any);
    },
    validate() {
      return api.validateField(name as any);
    },
  };
}

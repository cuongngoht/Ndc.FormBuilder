/* ============================================================
 * Core value typing (compile-time only)
 * ============================================================
 */

/**
 * Runtime values are a flat map keyed by field names.
 *
 * Even when you model values as a nested object type (e.g. { address: { street: string } }),
 * the store remains flat at runtime (e.g. { "address.street": "..." }).
 */
export type FieldValueMap = Record<string, unknown>;
export type FieldErrorMap = Record<string, string | null>;

type Primitive =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | Date
  | RegExp
  | Function;

type Join<K extends string, P extends string> = P extends "" ? K : `${K}.${P}`;

// Depth limiter to avoid "Type instantiation is excessively deep".
type PrevDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

/**
 * FieldPath<T>
 * - Produces dot-separated paths for nested object types.
 * - Arrays are treated as leafs by default to keep types cheap.
 */
export type FieldPath<T, D extends number = 5> = [D] extends [never]
  ? never
  : T extends Primitive
  ? never
  : T extends readonly unknown[]
  ? never
  : {
      [K in Extract<keyof T, string>]: T[K] extends Primitive
        ? K
        : T[K] extends readonly unknown[]
        ? K
        : K | Join<K, FieldPath<T[K], PrevDepth[D]>>;
    }[Extract<keyof T, string>];

export type FieldPathValue<
  T,
  P extends string
> = P extends `${infer K}.${infer R}`
  ? K extends keyof T
    ? FieldPathValue<T[K], R>
    : never
  : P extends keyof T
  ? T[P]
  : never;

/**
 * FormValues<TShape>
 * - Flat runtime values map produced from a nested type shape.
 */
export type FormValues<TShape> = {
  [P in FieldPath<TShape>]: FieldPathValue<TShape, P>;
};

/* ============================================================
 * Validators
 * ============================================================
 */

/**
 * Legacy validator (v0/v1): (value, values?) => msg
 * - values optional + runtime map (untyped-ish)
 */
export type LegacyValidator<TValue> = (
  value: TValue,
  values?: FieldValueMap
) => string | null;

/**
 * NEW: Legacy async validator (v1)
 */
export type LegacyAsyncValidator<TValue> = (
  value: TValue,
  values?: FieldValueMap
) => Promise<string | null>;

/**
 * Typed validator (v1+): (value, values) => msg
 * - values is the flat runtime map produced from TShape.
 *
 * NOTE:
 * - Exported as TypedValidator (NOT named Validator) to preserve old imports.
 */
export type TypedValidator<TValue, TShape> = (
  value: TValue,
  values: FormValues<TShape>
) => string | null;

/**
 * NEW: Typed async validator (v1)
 */
export type TypedAsyncValidator<TValue, TShape> = (
  value: TValue,
  values: FormValues<TShape>
) => Promise<string | null>;

/**
 * Boundary union used by field components / hook boundary.
 * - Supports both legacy + typed validators at runtime
 * - Supports both sync + async
 */
export type AnyValidator<TValue, TShape> =
  | LegacyValidator<TValue>
  | LegacyAsyncValidator<TValue>
  | TypedValidator<TValue, TShape>
  | TypedAsyncValidator<TValue, TShape>;

/**
 * ✅ BACKWARD COMPATIBILITY ALIAS
 * - Keep old code working:
 *   import { Validator } from "@ndc/form-builder";
 *   validators?: Validator<T>[]
 *
 * This stays as the legacy SYNC validator type.
 */
export type Validator<TValue> = LegacyValidator<TValue>;

export type SubmitHandler<TShape> = (values: FormValues<TShape>) => void;

/* ============================================================
 * Form API
 * ============================================================
 *
 * Default TShape is unknown-ish to keep legacy code ergonomic,
 * but WITHOUT leaking any.
 */
export type FormApi<TShape = Record<string, unknown>> = {
  // lifecycle
  register<P extends FieldPath<TShape>>(
    name: P,
    initialValue: FieldPathValue<TShape, P>
  ): void;
  unregister<P extends FieldPath<TShape>>(name: P): void;

  // values
  setValue<P extends FieldPath<TShape>>(
    name: P,
    value: FieldPathValue<TShape, P>
  ): void;
  getValue<P extends FieldPath<TShape>>(
    name: P
  ): FieldPathValue<TShape, P> | undefined;
  getValues(): FormValues<TShape>;

  // validators
  setValidators<P extends FieldPath<TShape>>(
    name: P,
    validators?: readonly AnyValidator<FieldPathValue<TShape, P>, TShape>[]
  ): void;

  // validation
  validateField<P extends FieldPath<TShape>>(name: P): string | null;
  validateAll(): boolean;

  /**
   * NEW (v1): true while any async validator is in-flight
   */
  isValidating(): boolean;

  // errors
  getError<P extends FieldPath<TShape>>(name: P): string | null;
  clearError<P extends FieldPath<TShape>>(name: P): void;

  // subscriptions (per-field)
  subscribeValue<P extends FieldPath<TShape>>(
    name: P,
    fn: () => void
  ): () => void;
  subscribeError<P extends FieldPath<TShape>>(
    name: P,
    fn: () => void
  ): () => void;

  // global subscription
  subscribe(fn: () => void): () => void;

  // reset/reinit
  reset(values?: Partial<FormValues<TShape>>): void;
};

export type FieldHandle<T> = {
  get(): T | undefined;
  set(value: T): void;
  validate(): string | null;
  readonly value: T | undefined;
};

export type TypedFormApi<TShape> = {
  [P in FieldPath<TShape>]: FieldHandle<FieldPathValue<TShape, P>>;
} & {
  validateAll(): boolean;
  reset(values?: Partial<FormValues<TShape>>): void;
  getValues(): FormValues<TShape>;
  isValidating(): boolean;
};

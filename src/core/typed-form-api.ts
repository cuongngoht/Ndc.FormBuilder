import type { FormApi, TypedFormApi } from "./ndc-form.types";

const validateAll = "validateAll";
const reset = "reset";
const getValues = "getValues";
const isValidating = "isValidating";

export function createTypedFormApi<TShape>(
  raw: FormApi<TShape>
): TypedFormApi<TShape> {
  return new Proxy({} as TypedFormApi<TShape>, {
    get(_, prop: string) {
      if (prop === validateAll) return raw.validateAll;
      if (prop === reset) return raw.reset;
      if (prop === getValues) return raw.getValues;
      if (prop === isValidating) return raw.isValidating;

      const key = prop as any;

      return {
        get: () => raw.getValue(key),
        set: (value: unknown) => raw.setValue(key, value as any),
        validate: () => raw.validateField(key),
        get value() {
          return raw.getValue(key);
        },
      };
    },
  });
}

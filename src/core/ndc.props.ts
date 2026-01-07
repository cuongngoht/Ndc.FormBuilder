import type { AnyValidator, FieldPath, FieldPathValue } from "./ndc-form.types";

export type NdcProps = {
  name: string;
  id?: string;
};
export type NdcFormVersion = "default" | "v1";

export type NdcFieldProps<
  TShape,
  P extends FieldPath<TShape>,
  TUiProps
> = NdcProps & {
  name: P;
  validators?: readonly AnyValidator<FieldPathValue<TShape, P>, TShape>[];
} & Omit<TUiProps, "validators" | "name">;

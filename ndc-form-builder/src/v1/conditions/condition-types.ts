import type {
  FieldPath,
  FieldPathValue,
  FormValues,
} from "../../core/ndc-form.types";

/**
 * Typed SetEffect:
 * - field = K
 * - value must be TValues[K]
 */
type SetEffect<TShape> = {
  [K in FieldPath<TShape>]: {
    type: "set";
    field: K;
    value:
      | FieldPathValue<TShape, K>
      | ((values: FormValues<TShape>) => FieldPathValue<TShape, K>);
  };
}[FieldPath<TShape>];

type ClearEffect<TShape> = {
  [K in FieldPath<TShape>]: {
    type: "clear";
    field: K;
  };
}[FieldPath<TShape>];

export type ConditionEffect<TShape> =
  | { type: "show"; field: FieldPath<TShape> }
  | { type: "hide"; field: FieldPath<TShape> }
  | { type: "enable"; field: FieldPath<TShape> }
  | { type: "disable"; field: FieldPath<TShape> }
  | { type: "set"; field: FieldPath<TShape>; value: unknown }
  | SetEffect<TShape>
  | ClearEffect<TShape>;

export type ConditionRule<TShape> = {
  when: (values: FormValues<TShape>) => boolean;
  effects: ReadonlyArray<ConditionEffect<TShape>>;
  priority?: number;
};

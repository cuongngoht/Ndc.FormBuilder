export type FieldMeta = {
  visible?: boolean;
  validate?: boolean;
  enabled?: boolean;
};

export const defaultMeta: Required<FieldMeta> = {
  visible: true,
  validate: true,
  enabled: true,
};

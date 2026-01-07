import * as React from "react";
import { FieldMeta } from "./meta/meta-types";
import type { FormApi } from "./ndc-form.types";

export type FieldMetaApi = {
  getMeta(name: string): FieldMeta | undefined;

  /** merge partial meta */
  setMeta(name: string, next: FieldMeta): void;

  /** subscribe meta changes of a field */
  subscribeMeta(name: string, fn: () => void): () => void;
};

export type NdcFormContextValue<TShape = any> = {
  api: FormApi<TShape>;
  metaApi: FieldMetaApi;
  formId: string;
};

export const NdcFormContext =
  React.createContext<NdcFormContextValue<any> | null>(null);

export function useNdcFormContext<TShape = any>() {
  const ctx = React.useContext(NdcFormContext);
  if (!ctx) {
    throw new Error("NdcField must be used inside NdcForm");
  }
  return ctx as NdcFormContextValue<TShape>;
}

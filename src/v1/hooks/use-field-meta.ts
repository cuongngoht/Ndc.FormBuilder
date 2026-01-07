import * as React from "react";
import { useNdcFormContext } from "../../core/ndc-form.context";
import type { FieldPath } from "../../core/ndc-form.types";

/**
 * Reactive field meta (visible/enabled) used by v1 conditions.
 */
export function useFieldMeta<TShape, P extends FieldPath<TShape>>(name: P) {
  const { metaApi } = useNdcFormContext<TShape>();

  const [, rerender] = React.useReducer((x) => x + 1, 0);
  const notify = React.useCallback(() => rerender(), []);

  React.useEffect(
    () => metaApi.subscribeMeta(name, notify),
    [metaApi, name, notify]
  );

  const meta = metaApi.getMeta(name);

  return {
    visible: meta?.visible !== false,
    enabled: meta?.enabled !== false,
  };
}

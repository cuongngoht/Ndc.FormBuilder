import type { FieldValueMap } from "../../core/ndc-form.types";
import type { ConditionEffect, ConditionRule } from "./condition-types";

export function evaluateConditions<TValues extends FieldValueMap>(
  values: TValues,
  rules: ReadonlyArray<ConditionRule<TValues>>
) {
  const sorted = [...rules].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
  );

  const nextValues: Partial<TValues> = {};
  const meta: Record<string, { visible?: boolean; enabled?: boolean }> = {};

  for (const rule of sorted) {
    if (!rule.when(values)) continue;

    for (const effect of rule.effects) {
      applyEffect(effect, values, nextValues, meta);
    }
  }

  return { desiredValues: nextValues, meta };
}

function applyEffect<TValues extends FieldValueMap>(
  effect: ConditionEffect<TValues>,
  values: TValues,
  nextValues: Partial<TValues>,
  meta: Record<string, { visible?: boolean; enabled?: boolean }>
) {
  const field = effect.field as string;

  switch (effect.type) {
    case "show":
      meta[field] = { ...meta[field], visible: true };
      break;

    case "hide":
      meta[field] = { ...meta[field], visible: false };
      break;

    case "enable":
      meta[field] = { ...meta[field], enabled: true };
      break;

    case "disable":
      meta[field] = { ...meta[field], enabled: false };
      break;

    case "set":
      nextValues[effect.field] =
        typeof effect.value === "function"
          ? effect.value(values)
          : effect.value;
      break;

    case "clear":
      nextValues[effect.field] = undefined as any;
      break;
  }
}

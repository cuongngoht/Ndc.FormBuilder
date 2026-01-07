export type ValidationState = {
  /**
   * Fields with an in-flight async validator
   */
  pending: Set<string>;

  /**
   * Last value that was validated (used to prevent duplicate async calls)
   */
  lastValidatedValue: Record<string, unknown>;
};

export function createValidationState(): ValidationState {
  return {
    pending: new Set<string>(),
    lastValidatedValue: {},
  };
}

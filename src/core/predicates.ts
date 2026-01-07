export const isOneOf =
  <T, K extends keyof T>(key: K, values: readonly T[K][]) =>
  (x: T): boolean =>
    values.includes(x[key]);

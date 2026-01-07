export type FieldName = string;

export type DependencyGraph = {
  /** dependency -> affected */
  forward: Map<FieldName, Set<FieldName>>;
  /** affected -> dependency */
  reverse: Map<FieldName, Set<FieldName>>;
};

export function createDependencyGraph(): DependencyGraph {
  return { forward: new Map(), reverse: new Map() };
}

export function linkDependency(
  graph: DependencyGraph,
  from: FieldName,
  to: FieldName
) {
  if (!graph.forward.has(from)) graph.forward.set(from, new Set());
  if (!graph.reverse.has(to)) graph.reverse.set(to, new Set());
  graph.forward.get(from)!.add(to);
  graph.reverse.get(to)!.add(from);
}

/**
 * Trace which flat keys were actually read from `values` during `fn(values)`.
 * Works well because your predicates ultimately access: values["a.b.c"].
 */
export function traceReads<T extends Record<string, unknown>>(
  fn: (values: T) => unknown,
  values: T
): Set<string> {
  const reads = new Set<string>();

  const proxy = new Proxy(values, {
    get(target, prop, receiver) {
      // record only string keys (flat map keys)
      if (typeof prop === 'string') reads.add(prop);
      return Reflect.get(target, prop, receiver);
    },
  }) as T;

  try {
    fn(proxy);
  } catch {
    // ignore: dependency tracing is best-effort debug tooling
  }

  return reads;
}

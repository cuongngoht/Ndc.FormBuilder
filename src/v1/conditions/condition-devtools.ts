import type { DependencyGraph } from './condition-graph';

export function renderDependencyGraphToConsole(opts: {
  formId: string;
  graph: DependencyGraph;
  title?: string;
}) {
  const { formId, graph } = opts;
  const title = opts.title ?? 'Condition Dependency Graph';

  const hasEdges =
    [...graph.forward.values()].reduce((n, s) => n + s.size, 0) > 0;

  const header = `[NdcForm:${formId}] ${title}`;

  if (!hasEdges) {
    console.groupCollapsed(header);
    console.log(
      '(no edges) — cannot infer dependencies if predicates never read values.'
    );
    console.groupEnd();
    return;
  }

  console.groupCollapsed(header);

  // Pretty print: each dependency -> list of affected fields
  const deps = [...graph.forward.keys()].sort();

  for (const dep of deps) {
    const targets = graph.forward.get(dep);
    if (!targets || targets.size === 0) continue;

    console.group(dep);
    [...targets].sort().forEach((t) => console.log('→', t));
    console.groupEnd();
  }

  console.groupEnd();
}

/** Optional: dev-only cycle detection */
export function detectCycles(graph: DependencyGraph): string[] {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles: string[] = [];

  const dfs = (node: string, stack: string[]) => {
    if (visiting.has(node)) {
      const idx = stack.indexOf(node);
      cycles.push(stack.slice(idx).concat(node).join(' -> '));
      return;
    }
    if (visited.has(node)) return;

    visiting.add(node);
    stack.push(node);

    for (const next of graph.forward.get(node) ?? []) dfs(next, stack);

    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of graph.forward.keys()) dfs(node, []);
  return cycles;
}

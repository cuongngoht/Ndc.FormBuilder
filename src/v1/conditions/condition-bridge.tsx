import React from "react";
import { FieldValueMap, NdcFormContext } from "../../react";
import {
    detectCycles,
    renderDependencyGraphToConsole,
} from "./condition-devtools";
import { UntypedConditionRule } from "./condition-dsl";
import { evaluateConditions } from "./condition-engine";
import {
    createDependencyGraph,
    linkDependency,
    traceReads,
} from "./condition-graph";
import { ConditionRule } from "./condition-types";

/* ============================================================
 * Helpers
 * ============================================================
 */

function isChildOf(parent: string, child: string) {
    return child === parent || child.startsWith(parent + ".");
}

function parentPath(path: string) {
    const parts = path.split(".");
    if (parts.length <= 1) return "";
    parts.pop();
    return parts.join(".");
}

/** Compare only the keys we actually care about to avoid redundant meta updates */
function metaShallowEqual(a: any, b: any) {
    return (
        a?.visible === b?.visible &&
        a?.enabled === b?.enabled &&
        a?.validate === b?.validate
    );
}

/* ============================================================
 * Condition Bridge (Optimized)
 * ============================================================
 */

function ConditionBridge<TValues extends FieldValueMap>({
    conditions,
    devtools,
}: {
    conditions: ReadonlyArray<UntypedConditionRule>;
    devtools?: boolean;
}) {
    const ctx = React.useContext(NdcFormContext);
    if (!ctx) throw new Error("Missing form context");

    const { api, metaApi, formId } = ctx;

    React.useEffect(() => {
        if (!conditions || conditions.length === 0) return;

        /* --------------------------------------------
         * 0) Precompute show-controlled fields
         * -------------------------------------------- */
        const showControlledFields = new Set<string>();
        for (const rule of conditions) {
            for (const effect of rule.effects) {
                if (effect.type === "show") showControlledFields.add(effect.field);
            }
        }

        /* --------------------------------------------
         * 1) Precompute dependencies (what predicates actually read)
         * -------------------------------------------- */
        const depsSet = new Set<string>();
        const initialValues = api.getValues() as Record<string, unknown>;

        for (const rule of conditions) {
            const deps = traceReads(rule.when as any, initialValues as any);
            for (const d of deps) depsSet.add(d);
        }

        /* --------------------------------------------
         * 1.1) Devtools graph (optional)
         * -------------------------------------------- */
        if (devtools) {
            const graph = createDependencyGraph();
            const cur = api.getValues() as Record<string, unknown>;

            for (const rule of conditions) {
                const deps = traceReads(rule.when as any, cur as any);
                for (const eff of rule.effects) {
                    for (const dep of deps) linkDependency(graph, dep, eff.field);
                }
            }

            const cycles = detectCycles(graph);
            renderDependencyGraphToConsole({
                formId: String(formId ?? "unknown"),
                graph,
            });

            if (cycles.length) {
                console.groupCollapsed(
                    `[NdcForm:${String(formId ?? "unknown")}] Condition Graph Cycles`
                );
                cycles.forEach((c) => console.warn(c));
                console.groupEnd();
            }
        }

        /* --------------------------------------------
         * 2) Build subtree index (children map)
         *    - We rebuild only when field set changes.
         * -------------------------------------------- */
        let cachedFieldKeys: string[] = [];
        let childrenMap = new Map<string, string[]>();

        const rebuildChildrenMapIfNeeded = () => {
            const keys = Object.keys(api.getValues() as Record<string, unknown>);

            // cheap check: same length + same keys in same order is not guaranteed,
            // but for most runtime stores, Object.keys order is stable by insertion.
            // To be safe, we rebuild if length differs OR any key differs.
            let same = keys.length === cachedFieldKeys.length;
            if (same) {
                for (let i = 0; i < keys.length; i++) {
                    if (keys[i] !== cachedFieldKeys[i]) {
                        same = false;
                        break;
                    }
                }
            }

            if (same) return;

            cachedFieldKeys = keys;
            const next = new Map<string, string[]>();

            for (const field of keys) {
                const p = parentPath(field);
                if (!p) continue;
                const arr = next.get(p);
                if (arr) arr.push(field);
                else next.set(p, [field]);
            }

            childrenMap = next;
        };

        const walkSubtree = (root: string, visit: (name: string) => void) => {
            // Ensure we have current structure (fields can register/unregister)
            rebuildChildrenMapIfNeeded();

            // iterative DFS
            const stack: string[] = [root];
            while (stack.length) {
                const cur = stack.pop()!;
                visit(cur);
                const kids = childrenMap.get(cur);
                if (kids && kids.length) {
                    for (let i = 0; i < kids.length; i++) stack.push(kids[i]);
                }
            }
        };

        /* --------------------------------------------
         * 3) Meta update guard (avoid notify storms)
         * -------------------------------------------- */
        const setMetaIfChanged = (name: string, patch: any) => {
            const prev = metaApi.getMeta(name);
            const merged = { ...(prev ?? { visible: true, enabled: true }), ...patch };
            if (metaShallowEqual(prev, merged)) return;
            metaApi.setMeta(name, patch);
        };

        /* --------------------------------------------
         * 4) Scheduler: batch multiple rapid changes into one run
         * -------------------------------------------- */
        let scheduled = false;
        let running = false;

        const scheduleRun = () => {
            if (scheduled) return;
            scheduled = true;

            queueMicrotask(() => {
                scheduled = false;
                run();
            });
        };

        /* --------------------------------------------
         * 5) Core run (keeps your existing semantics)
         * -------------------------------------------- */
        const run = () => {
            if (running) return;
            running = true;

            const values = api.getValues() as TValues;
            const typedRules =
                conditions as unknown as ReadonlyArray<ConditionRule<TValues>>;

            const { desiredValues, meta } = evaluateConditions(values, typedRules);

            // 1) baseline: hide all show-controlled fields
            showControlledFields.forEach((field) => {
                setMetaIfChanged(field, { visible: false, validate: false });
            });

            // 2) apply meta from conditions
            for (const key of Object.keys(meta)) {
                setMetaIfChanged(key, meta[key]);
            }

            // 3) cascade subtree visibility/validation
            //    - Instead of scanning allFields for every root, we walk actual subtree.
            const cascadeRoots = new Set<string>([
                ...showControlledFields,
                ...Object.keys(meta),
            ]);

            for (const root of cascadeRoots) {
                const m = metaApi.getMeta(root);

                // root hidden => subtree hidden + not validatable
                if (m?.visible === false) {
                    walkSubtree(root, (field) => {
                        setMetaIfChanged(field, { visible: false, validate: false });
                    });
                    continue;
                }

                // root shown => subtree validatable again
                if (m?.visible === true) {
                    walkSubtree(root, (field) => {
                        setMetaIfChanged(field, { visible: true, validate: true });
                    });
                }
            }

            // 4) apply value effects
            for (const key of Object.keys(desiredValues) as (keyof TValues)[]) {
                const prev = api.getValue(key as string);
                const next = desiredValues[key];
                if (prev !== next) api.setValue(key as string, next);
            }

            running = false;
        };

        // initial run
        run();

        /* --------------------------------------------
         * 6) Subscribe ONLY to dependencies
         *    - If a predicate reads nothing, fallback to global subscribe.
         * -------------------------------------------- */
        const unsubs: Array<() => void> = [];

        if (depsSet.size === 0) {
            // rare: predicate doesn't read any fields => can't know what triggers it
            unsubs.push(api.subscribe(scheduleRun));
        } else {
            for (const dep of depsSet) {
                unsubs.push(api.subscribeValue(dep as any, scheduleRun));
            }

            // Optional safety: if forms dynamically create fields that *become* deps later,
            // you can also keep a low-cost global subscribe, but that reduces gains.
            // unsubs.push(api.subscribe(scheduleRun));
        }

        return () => {
            unsubs.forEach((u) => u());
        };
    }, [api, metaApi, conditions, devtools, formId]);

    return null;
}

export { ConditionBridge };

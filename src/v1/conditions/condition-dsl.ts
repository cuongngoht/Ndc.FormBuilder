/* ============================================================
 * Condition DSL (typed at compile-time, untyped at runtime)
 * ============================================================
 *
 * Goals:
 * - keep runtime output exactly as UntypedConditionRule
 * - enable selector API: (x) => x.a.b.c
 * - preserve v0 string-field API
 * - support full when / else branching
 */

import type {
  FieldPath,
  FieldPathValue,
  FormValues,
} from "../../core/ndc-form.types";

/* ============================================================
 * Untyped runtime rule (DSL output)
 * ============================================================
 */

type AnyValues = Record<string, any>;

export type UntypedConditionEffect =
  | { type: "show"; field: string }
  | { type: "hide"; field: string }
  | { type: "enable"; field: string }
  | { type: "disable"; field: string }
  | {
      type: "set";
      field: string;
      value: unknown | ((values: AnyValues) => unknown);
    }
  | { type: "clear"; field: string };

export type UntypedConditionRule = {
  when: (values: AnyValues) => boolean;
  effects: ReadonlyArray<UntypedConditionEffect>;
  priority?: number;
};

/* ============================================================
 * Typed selector utilities
 * ============================================================
 */

type Predicate<TShape> = (values: FormValues<TShape>) => boolean;
export type FieldSelector<TShape, TValue> = (x: TShape) => TValue;

function invertWhen(fn: (values: AnyValues) => boolean) {
  return (values: AnyValues) => !fn(values);
}

/**
 * Build a selector-to-path resolver.
 *
 * Runtime trick:
 * - provide a Proxy tree
 * - selector reads properties (x.a.b.c)
 * - each property read returns another proxy that stringifies to the built path
 */
function createFieldOf<TShape>() {
  const makeProxy = (path: string[]): any =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === Symbol.toPrimitive) return () => path.join(".");
          if (prop === "toString") return () => path.join(".");
          if (prop === "valueOf") return () => path.join(".");
          return makeProxy([...path, String(prop)]);
        },
      }
    );

  return <P extends FieldPath<TShape>>(
    selector: (x: TShape) => FieldPathValue<TShape, P>
  ): P => {
    const proxy = makeProxy([]) as TShape;
    const out = selector(proxy);
    return String(out) as P;
  };
}

/**
 * Typed accessor for predicates:
 *
 * Example:
 * when<MyShape>((values) => v(values, (x) => x.address.country) === 'VN')
 */
export function v<TShape, P extends FieldPath<TShape>>(
  values: FormValues<TShape>,
  selector: (x: TShape) => FieldPathValue<TShape, P>
): FieldPathValue<TShape, P> {
  const fieldOf = createFieldOf<TShape>();
  const path = fieldOf(selector);
  return values[path];
}

/* ============================================================
 * EffectBuilder
 * ============================================================
 */

type FieldRef<TShape> = string | FieldPath<TShape> | ((x: TShape) => any);

class EffectBuilder<TShape = AnyValues> {
  constructor(
    private readonly whenFn: (values: AnyValues) => boolean,
    private readonly effects: UntypedConditionEffect[],
    private readonly priority?: number,
    private readonly getField?: <P extends FieldPath<TShape>>(
      selector: (x: TShape) => FieldPathValue<TShape, P>
    ) => P
  ) {}

  private resolveField(field: FieldRef<TShape>) {
    if (typeof field === "string") return field;
    if (!this.getField) return String(field);
    return this.getField(field as any) as unknown as string;
  }

  show(field: FieldRef<TShape>) {
    return new EffectBuilder(
      this.whenFn,
      [...this.effects, { type: "show", field: this.resolveField(field) }],
      this.priority,
      this.getField
    );
  }

  hide(field: FieldRef<TShape>) {
    return new EffectBuilder(
      this.whenFn,
      [...this.effects, { type: "hide", field: this.resolveField(field) }],
      this.priority,
      this.getField
    );
  }

  enable(field: FieldRef<TShape>) {
    return new EffectBuilder(
      this.whenFn,
      [...this.effects, { type: "enable", field: this.resolveField(field) }],
      this.priority,
      this.getField
    );
  }

  disable(field: FieldRef<TShape>) {
    return new EffectBuilder(
      this.whenFn,
      [...this.effects, { type: "disable", field: this.resolveField(field) }],
      this.priority,
      this.getField
    );
  }

  /**
   * Backward-compatible API (untyped)
   */
  set(field: string, value: unknown | ((values: AnyValues) => unknown)) {
    return new EffectBuilder(
      this.whenFn,
      [...this.effects, { type: "set", field, value }],
      this.priority,
      this.getField
    );
  }

  /**
   * ✅ Typed API
   * - `field` can be a selector: (x) => x.a.b.c
   * - `value` can be literal or computed from flat values
   */
  setValue<P extends FieldPath<TShape>>(
    field: P | ((x: TShape) => FieldPathValue<TShape, P>),
    value:
      | FieldPathValue<TShape, P>
      | ((values: FormValues<TShape>) => FieldPathValue<TShape, P>)
  ) {
    const resolvedField = this.resolveField(field as any);

    const runtimeValue: unknown | ((values: AnyValues) => unknown) =
      typeof value === "function"
        ? (values: AnyValues) =>
            (value as (v: FormValues<TShape>) => unknown)(
              values as FormValues<TShape>
            )
        : value;

    return new EffectBuilder(
      this.whenFn,
      [
        ...this.effects,
        { type: "set", field: resolvedField, value: runtimeValue },
      ],
      this.priority,
      this.getField
    );
  }

  clear(field: FieldRef<TShape>) {
    return new EffectBuilder(
      this.whenFn,
      [...this.effects, { type: "clear", field: this.resolveField(field) }],
      this.priority,
      this.getField
    );
  }

  withPriority(priority: number) {
    return new EffectBuilder(
      this.whenFn,
      this.effects,
      priority,
      this.getField
    );
  }

  else() {
    return new ElseEffectBuilder(
      this.whenFn,
      this.effects,
      this.priority,
      this.getField
    );
  }

  toRules(): UntypedConditionRule[] {
    return [
      {
        when: this.whenFn,
        effects: this.effects,
        priority: this.priority,
      },
    ];
  }
}

/* ============================================================
 * ElseEffectBuilder
 * ============================================================
 */

class ElseEffectBuilder<TShape = AnyValues> {
  private readonly elseEffects: UntypedConditionEffect[] = [];

  constructor(
    private readonly whenFn: (values: AnyValues) => boolean,
    private readonly thenEffects: UntypedConditionEffect[],
    private readonly priority?: number,
    private readonly getField?: <P extends FieldPath<TShape>>(
      selector: (x: TShape) => FieldPathValue<TShape, P>
    ) => P
  ) {}

  private resolveField(field: FieldRef<TShape>) {
    if (typeof field === "string") return field;
    if (!this.getField) return String(field);
    return this.getField(field as any) as unknown as string;
  }

  show(field: FieldRef<TShape>) {
    this.elseEffects.push({ type: "show", field: this.resolveField(field) });
    return this;
  }

  hide(field: FieldRef<TShape>) {
    this.elseEffects.push({ type: "hide", field: this.resolveField(field) });
    return this;
  }

  enable(field: FieldRef<TShape>) {
    this.elseEffects.push({ type: "enable", field: this.resolveField(field) });
    return this;
  }

  disable(field: FieldRef<TShape>) {
    this.elseEffects.push({ type: "disable", field: this.resolveField(field) });
    return this;
  }

  /**
   * Backward-compatible API (untyped)
   */
  set(field: string, value: unknown | ((values: AnyValues) => unknown)) {
    this.elseEffects.push({ type: "set", field, value });
    return this;
  }

  /**
   * ✅ Typed API
   */
  setValue<P extends FieldPath<TShape>>(
    field: P | ((x: TShape) => FieldPathValue<TShape, P>),
    value:
      | FieldPathValue<TShape, P>
      | ((values: FormValues<TShape>) => FieldPathValue<TShape, P>)
  ) {
    const resolvedField = this.resolveField(field as any);

    const runtimeValue: unknown | ((values: AnyValues) => unknown) =
      typeof value === "function"
        ? (values: AnyValues) =>
            (value as (v: FormValues<TShape>) => unknown)(
              values as FormValues<TShape>
            )
        : value;

    this.elseEffects.push({
      type: "set",
      field: resolvedField,
      value: runtimeValue,
    });
    return this;
  }

  clear(field: FieldRef<TShape>) {
    this.elseEffects.push({ type: "clear", field: this.resolveField(field) });
    return this;
  }

  withPriority(priority: number) {
    return new ElseEffectBuilder(
      this.whenFn,
      this.thenEffects,
      priority,
      this.getField
    );
  }

  toRules(): UntypedConditionRule[] {
    return [
      {
        when: this.whenFn,
        effects: this.thenEffects,
        priority: this.priority,
      },
      {
        when: invertWhen(this.whenFn),
        effects: this.elseEffects,
        priority: this.priority,
      },
    ];
  }
}

/* ============================================================
 * Public DSL entry
 * ============================================================
 */

/**
 * Typed entry:
 * - predicate receives flat runtime values (FormValues<TShape>)
 * - use helper `v(values, selector)` to read values via selectors
 */
export function when<TShape>(
  predicate: Predicate<TShape>
): EffectBuilder<TShape> {
  const getField = createFieldOf<TShape>();
  const whenFn = (values: AnyValues) =>
    Boolean(predicate(values as FormValues<TShape>));
  return new EffectBuilder<TShape>(whenFn, [], undefined, getField);
}

/**
 * Legacy entry:
 * - keeps backwards compatibility with untyped values
 */
export function whenUntyped(
  predicate: (values: AnyValues) => boolean
): EffectBuilder<AnyValues> {
  const whenFn = (values: AnyValues) => Boolean(predicate(values));
  return new EffectBuilder<AnyValues>(whenFn, [], undefined, undefined);
}

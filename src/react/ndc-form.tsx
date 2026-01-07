import * as React from "react";
import { JSX } from "react/jsx-runtime";
import type { NdcProps } from "../core";
import { FieldMeta } from "../core/meta/meta-types";
import { NdcFormContext } from "../core/ndc-form.context";
import type {
    AnyValidator,
    FieldErrorMap,
    FieldPath,
    FieldPathValue,
    FormApi,
    FormValues,
    SubmitHandler,
    TypedFormApi,
} from "../core/ndc-form.types";
import { createTypedFormApi } from "../core/typed-form-api";
import { isEffectivelyValidatable } from "../core/validation/validatable";
import { createValidationState } from "../core/validation/validation-state";

/* ============================================================
 * Types
 * ============================================================
 */

type NdcFormProps<TShape> = {
    id: string;
    children: React.ReactNode;
    onSubmit?: SubmitHandler<TShape>;
};

type Listener = () => void;

type RuntimeValues = Record<string, unknown>;

/* ============================================================
 * Notifier
 * ============================================================
 */

function createNotifier() {
    const valueListeners = new Map<string, Set<Listener>>();
    const errorListeners = new Map<string, Set<Listener>>();
    const metaListeners = new Map<string, Set<Listener>>();
    const globalListeners = new Set<Listener>();

    const notifyValue = (name: string) => {
        valueListeners.get(name)?.forEach((fn) => fn());
        globalListeners.forEach((fn) => fn());
    };

    const notifyError = (name: string) => {
        errorListeners.get(name)?.forEach((fn) => fn());
        globalListeners.forEach((fn) => fn());
    };

    const notifyMeta = (name: string) => {
        metaListeners.get(name)?.forEach((fn) => fn());
        globalListeners.forEach((fn) => fn());
    };

    const notifyAll = (values: object, errors: object) => {
        const keys = new Set([...Object.keys(values), ...Object.keys(errors)]);
        keys.forEach((k) => {
            valueListeners.get(k)?.forEach((fn) => fn());
            errorListeners.get(k)?.forEach((fn) => fn());
        });
        globalListeners.forEach((fn) => fn());
    };

    const subscribe =
        (map: Map<string, Set<Listener>>) => (name: string, fn: Listener) => {
            const set = map.get(name) ?? new Set<Listener>();
            set.add(fn);
            map.set(name, set);
            return () => {
                set.delete(fn);
                if (set.size === 0) map.delete(name);
            };
        };

    return {
        valueListeners,
        errorListeners,
        metaListeners,
        globalListeners,
        notifyValue,
        notifyError,
        notifyMeta,
        notifyAll,
        subscribeValue: subscribe(valueListeners),
        subscribeError: subscribe(errorListeners),
        subscribeMeta: subscribe(metaListeners),
        subscribeGlobal(fn: Listener) {
            globalListeners.add(fn);
            return () => globalListeners.delete(fn);
        },
    };
}

/* ============================================================
 * Store
 * ============================================================
 */

function createFormStore<TShape>() {
    return {
        values: {} as RuntimeValues,
        errors: {} as FieldErrorMap,
        meta: {} as Record<string, FieldMeta>,
        validators: {} as Record<string, readonly AnyValidator<any, TShape>[] | undefined>,
        validation: createValidationState(),
        notifier: createNotifier(),
    };
}

/* ============================================================
 * Form
 * ============================================================
 */

const NdcFormInner = <TShape,>(
    { id, children, onSubmit }: NdcFormProps<TShape>,
    ref: React.Ref<TypedFormApi<TShape>>
) => {
    const storeRef = React.useRef(createFormStore<TShape>());
    const store = storeRef.current;

    const api = React.useMemo<FormApi<TShape>>(
        () => ({
            register<P extends FieldPath<TShape>>(name: P, initialValue: FieldPathValue<TShape, P>) {
                const key = name as string;
                if (!(key in store.values)) {
                    store.values[key] = initialValue;
                    store.errors[key] ??= null;
                    store.meta[key] ??= { visible: true, enabled: true, validate: true };
                    store.notifier.notifyValue(key);
                    store.notifier.notifyError(key);
                    store.notifier.notifyMeta(key);
                }
            },

            unregister<P extends FieldPath<TShape>>(name: P) {
                const key = name as string;
                let changed = false;

                if (key in store.values) {
                    delete store.values[key];
                    changed = true;
                }
                if (key in store.errors) {
                    delete store.errors[key];
                    changed = true;
                }
                if (key in store.meta) {
                    delete store.meta[key];
                    changed = true;
                }

                delete store.validators[key];
                store.validation.pending.delete(key);
                delete store.validation.lastValidatedValue[key];

                store.notifier.valueListeners.delete(key);
                store.notifier.errorListeners.delete(key);
                store.notifier.metaListeners.delete(key);

                if (changed) store.notifier.notifyAll(store.values, store.errors);
            },

            setValue<P extends FieldPath<TShape>>(name: P, value: FieldPathValue<TShape, P>) {
                const key = name as string;
                store.values[key] = value;
                delete store.validation.lastValidatedValue[key];

                if (store.errors[key]) {
                    store.errors[key] = null;
                    store.notifier.notifyError(key);
                }
                store.notifier.notifyValue(key);
            },

            getValue<P extends FieldPath<TShape>>(name: P) {
                return store.values[name as string] as FieldPathValue<TShape, P> | undefined;
            },

            getValues(): FormValues<TShape> {
                return store.values as FormValues<TShape>;
            },

            setValidators<P extends FieldPath<TShape>>(
                name: P,
                validators:
                    | readonly AnyValidator<FieldPathValue<TShape, P>, TShape>[]
                    | undefined
            ) {
                store.validators[name as string] = validators as
                    | readonly AnyValidator<any, TShape>[]
                    | undefined;
                delete store.validation.lastValidatedValue[name as string];
            },

            validateField<P extends FieldPath<TShape>>(name: P) {
                const key = name as string;

                if (!isEffectivelyValidatable(key, store.meta)) {
                    store.validation.pending.delete(key);
                    delete store.validation.lastValidatedValue[key];
                    if (store.errors[key] !== null) {
                        store.errors[key] = null;
                        store.notifier.notifyError(key);
                    }
                    return null;
                }

                if (store.validation.pending.has(key)) {
                    return store.errors[key] ?? null;
                }

                const rules = store.validators[key];
                const value = store.values[key] as FieldPathValue<TShape, P> | undefined;
                const typedValues = store.values as FormValues<TShape>;

                if (!rules?.length) {
                    if (store.errors[key] !== null) {
                        store.errors[key] = null;
                        store.notifier.notifyError(key);
                    }
                    return null;
                }

                if (store.validation.lastValidatedValue[key] === value) {
                    return store.errors[key] ?? null;
                }

                store.validation.lastValidatedValue[key] = value as unknown;

                for (const rule of rules) {
                    const result = (rule as any)(value, typedValues) as
                        | string
                        | null
                        | Promise<string | null>;

                    if (result && typeof (result as any).then === "function") {
                        const valueAtStart = value;
                        store.validation.pending.add(key);
                        store.notifier.notifyError(key);

                        (result as Promise<string | null>).then((msg) => {
                            if (!isEffectivelyValidatable(key, store.meta)) {
                                store.validation.pending.delete(key);
                                return;
                            }
                            if (store.validation.lastValidatedValue[key] !== valueAtStart) {
                                store.validation.pending.delete(key);
                                return;
                            }
                            store.validation.pending.delete(key);
                            const next = msg ?? null;
                            if (store.errors[key] !== next) {
                                store.errors[key] = next;
                                store.notifier.notifyError(key);
                            }
                        });
                        return null;
                    }

                    const msg = result as string | null;
                    if (msg) {
                        if (store.errors[key] !== msg) {
                            store.errors[key] = msg;
                            store.notifier.notifyError(key);
                        }
                        return msg;
                    }
                }

                if (store.errors[key] !== null) {
                    store.errors[key] = null;
                    store.notifier.notifyError(key);
                }
                return null;
            },

            validateAll() {
                let ok = true;
                for (const key of Object.keys(store.values)) {
                    if (api.validateField(key as FieldPath<TShape>)) ok = false;
                }
                if (store.validation.pending.size > 0) return false;
                return ok;
            },

            isValidating() {
                return store.validation.pending.size > 0;
            },

            getError<P extends FieldPath<TShape>>(name: P) {
                return store.errors[name as string] ?? null;
            },

            clearError<P extends FieldPath<TShape>>(name: P) {
                const key = name as string;
                if (store.errors[key] !== null) {
                    store.errors[key] = null;
                    store.notifier.notifyError(key);
                }
            },

            subscribeValue<P extends FieldPath<TShape>>(name: P, fn: () => void) {
                return store.notifier.subscribeValue(name as string, fn);
            },

            subscribeError<P extends FieldPath<TShape>>(name: P, fn: () => void) {
                return store.notifier.subscribeError(name as string, fn);
            },

            subscribe(fn: () => void) {
                return store.notifier.subscribeGlobal(fn);
            },

            reset(nextValues) {
                store.errors = {};
                store.values = nextValues
                    ? ({ ...store.values, ...nextValues } as RuntimeValues)
                    : ({} as RuntimeValues);
                store.validation.pending.clear();
                store.validation.lastValidatedValue = {};
                store.notifier.notifyAll(store.values, store.errors);
            },
        }),
        []
    );

    const metaApi = React.useMemo(
        () => ({
            getMeta(name: string) {
                return store.meta[name];
            },

            setMeta(name: string, next: FieldMeta) {
                const prev = store.meta[name] ?? {
                    visible: true,
                    enabled: true,
                    validate: true,
                };

                const merged = { ...prev, ...next };
                store.meta[name] = merged;

                const becameValidatable =
                    (prev.visible === false || prev.validate === false) &&
                    merged.visible === true &&
                    merged.validate === true;

                if (becameValidatable) {
                    delete store.validation.lastValidatedValue[name];
                }

                if (merged.visible === false || merged.validate === false) {
                    store.validation.pending.delete(name);
                    delete store.validation.lastValidatedValue[name];
                    if (store.errors[name] !== null) {
                        store.errors[name] = null;
                        store.notifier.notifyError(name);
                    }
                }

                if (
                    prev.visible !== merged.visible ||
                    prev.enabled !== merged.enabled ||
                    prev.validate !== merged.validate
                ) {
                    store.notifier.notifyMeta(name);
                }
            },

            subscribeMeta(name: string, fn: () => void) {
                return store.notifier.subscribeMeta(name, fn);
            },
        }),
        []
    );

    const typedApi = React.useMemo(() => createTypedFormApi(api), [api]);
    React.useImperativeHandle(ref, () => typedApi);

    const handleSubmit = React.useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            if (api.validateAll()) onSubmit?.(store.values as FormValues<TShape>);
        },
        [api, onSubmit]
    );

    return (
        <NdcFormContext.Provider value={{ api, metaApi, formId: id }}>
            <form id={id} onSubmit={handleSubmit}>
                {injectIds(children, id)}
            </form>
        </NdcFormContext.Provider>
    );
};

/* ============================================================
 * Export
 * ============================================================
 */

export const NdcForm = React.forwardRef(NdcFormInner) as <TShape>(
    props: NdcFormProps<TShape> & { ref?: React.Ref<TypedFormApi<TShape>> }
) => JSX.Element;

/* ============================================================
 * Utils
 * ============================================================
 */

function buildFieldId(formId: string, fieldName: string) {
    return `${formId}__${fieldName}`;
}

function injectIds(children: React.ReactNode, formId: string): React.ReactNode {
    return React.Children.map(children, (child) => {
        if (!React.isValidElement<NdcProps>(child)) return child;
        const { name, id } = child.props as any;
        if (name && !id) {
            return React.cloneElement(child, {
                id: buildFieldId(formId, name),
            } as any);
        }
        return child;
    });
}

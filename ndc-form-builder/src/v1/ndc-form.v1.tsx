import * as React from "react";
import { JSX } from "react";
import { NdcFormContext } from "../core/ndc-form.context";
import type { FieldValueMap, TypedFormApi } from "../core/ndc-form.types";
import { NdcForm as BaseForm } from "../react/ndc-form";
import { ConditionBridge } from "./conditions/condition-bridge";
import type { UntypedConditionRule } from "./conditions/condition-dsl";

/* ============================================================
 * Props
 * ============================================================
 */

type Props<TShape extends FieldValueMap> = {
    id: string;
    conditions?: ReadonlyArray<UntypedConditionRule>;
    children: React.ReactNode;
    devtools?: boolean;
};

/* ============================================================
 * Field Visibility Gate
 * ============================================================
 */

function FieldVisibilityGate({
    name,
    children,
}: {
    name?: string;
    children: React.ReactNode;
}) {
    if (!name) return <>{children}</>;

    const ctx = React.useContext(NdcFormContext);
    if (!ctx) throw new Error("Missing form context");

    const { metaApi } = ctx;
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

    React.useEffect(() => {
        return metaApi.subscribeMeta(name, forceUpdate);
    }, [metaApi, name]);

    const meta = metaApi.getMeta(name);
    const hidden = meta?.visible === false;

    return <div style={{ display: hidden ? "none" : undefined }}>{children}</div>;
}

function applyVisibility(children: React.ReactNode): React.ReactNode {
    return React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;

        const props = child.props as { name?: string; children?: React.ReactNode };
        const processedChildren = props.children
            ? applyVisibility(props.children)
            : props.children;

        return (
            <FieldVisibilityGate name={props.name}>
                {React.cloneElement(child, undefined, processedChildren)}
            </FieldVisibilityGate>
        );
    });
}

function NdcFormV1Inner<TShape extends FieldValueMap>(
    { id, conditions, children, devtools }: Props<TShape>,
    ref: React.Ref<TypedFormApi<TShape>>
) {
    return (
        <BaseForm<TShape> id={id} ref={ref}>
            {conditions && conditions.length > 0 && (
                <ConditionBridge<TShape> conditions={conditions} devtools={devtools} />
            )}
            {applyVisibility(children)}
        </BaseForm>
    );
}

export const NdcFormV1 = React.forwardRef(NdcFormV1Inner) as <
    TShape extends FieldValueMap
>(
    props: Props<TShape> & { ref?: React.Ref<TypedFormApi<TShape>> }
) => JSX.Element;

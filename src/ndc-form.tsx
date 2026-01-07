import * as React from "react";
import { JSX } from "react/jsx-runtime";

import {
    FieldValueMap,
    SubmitHandler,
    TypedFormApi,
} from "./core/ndc-form.types";

import { NdcForm as BaseForm } from "./ndc-form";
import { UntypedConditionRule } from "./v1";
import { NdcFormV1 } from "./v1/ndc-form.v1";

type BaseProps<TValues extends FieldValueMap> = {
    id: string;
    children: React.ReactNode;
    onSubmit?: SubmitHandler<TValues>;
    devtools?: boolean;
};

type V0Props<TValues extends FieldValueMap> = BaseProps<TValues> & {
    version?: "v0";
    conditions?: never;
};

type V1Props<TValues extends FieldValueMap> = BaseProps<TValues> & {
    version: "v1";
    conditions?: ReadonlyArray<UntypedConditionRule>;
};

export type NdcFormProps<TValues extends FieldValueMap> =
    | V0Props<TValues>
    | V1Props<TValues>;

function NdcFormInner<TValues extends FieldValueMap>(
    props: NdcFormProps<TValues>,
    ref: React.Ref<TypedFormApi<TValues>>
) {
    const { version = "v0", devtools, ...rest } = props as any;

    if (version === "v1") {
        const { conditions, ...v1Rest } = rest as V1Props<TValues>;

        if (!conditions || conditions.length === 0) {
            return <BaseForm<TValues> {...v1Rest} ref={ref} />;
        }

        return (
            <NdcFormV1<TValues>
                {...v1Rest}
                conditions={conditions}
                devtools={devtools}
                ref={ref}
            />
        );
    }

    return <BaseForm<TValues> {...(rest as any)} ref={ref} />;
}

export const NdcForm = React.forwardRef(NdcFormInner) as <
    TValues extends FieldValueMap
>(
    props: NdcFormProps<TValues> & { ref?: React.Ref<TypedFormApi<TValues>> }
) => JSX.Element;

import React from "react";
import type { FieldPath } from "../core/ndc-form.types";

export type NDCSectionProps<TShape> = {
    name: FieldPath<TShape>;
    label?: string;
    children: React.ReactNode;
};

export function NdcSection<TShape>({
    name,
    label,
    children,
}: NDCSectionProps<TShape>) {
    return (
        <div data-name={name}>
            {label && <div className="section-label">{label}</div>}
            {children}
        </div>
    );
}

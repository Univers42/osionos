/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LayoutControlField.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// One inspector control. Every option comes from the control's scale and a
// select's string goes back through parseLayoutChoice, so nothing typed or
// tampered with reaches the stored style (ADR 0064 PS2).

import React, { useId } from "react";

import { MiniTabs, Select, Toggle } from "@/shared/ui";
import { parseLayoutChoice, type LayoutControl, type LayoutKey, type LayoutValue } from "../../model/layoutInspector";

export type LayoutChoiceHandler = (control: LayoutControl, value: LayoutValue | undefined) => void;

interface FieldProps {
  control: LayoutControl;
  label: string;
  onChoose: LayoutChoiceHandler;
}

const ROW_CLASS = "flex min-h-[var(--osio-control-h-sm)] items-center justify-between gap-3 text-sm text-[var(--osio-fg-default)]";

function optionLabel(key: LayoutKey, value: LayoutValue): string {
  if (key === "minCol") return `${value} rem`;
  if (typeof value === "number") return String(value);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function ArrangeField({ control, label, onChoose }: Readonly<FieldProps>) {
  const id = useId();
  const options = control.options.map((value) => ({ value: String(value), label: optionLabel(control.key, value) }));
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-1.5">
      <span id={id} className="text-xs font-medium text-[var(--osio-fg-muted)]">{label}</span>
      <MiniTabs size="sm" value={String(control.value ?? "row")} options={options} onChange={(raw) => onChoose(control, parseLayoutChoice(control.key, raw) ?? undefined)} />
    </div>
  );
}

function WrapField({ control, label, onChoose }: Readonly<FieldProps>) {
  return (
    <div className={ROW_CLASS}>
      <span aria-hidden="true">{label}</span>
      <Toggle size="sm" label={label} checked={control.value === "wrap"} onChange={(on) => onChoose(control, on ? "wrap" : undefined)} />
    </div>
  );
}

function SelectField({ control, label, onChoose }: Readonly<FieldProps>) {
  const id = useId();
  const choose = (raw: string) => {
    const value = parseLayoutChoice(control.key, raw);
    if (value !== null) onChoose(control, value);
  };
  return (
    <div className={ROW_CLASS}>
      <label htmlFor={id}>{label}</label>
      <Select id={id} className="!h-[var(--osio-control-h-sm)] !w-32" value={control.value === undefined ? "" : String(control.value)} onChange={(event) => choose(event.target.value)}>
        <option value="">Default</option>
        {control.options.map((value) => <option key={value} value={String(value)}>{optionLabel(control.key, value)}</option>)}
      </Select>
    </div>
  );
}

export function LayoutControlField(props: Readonly<FieldProps>) {
  if (props.control.key === "layout") return <ArrangeField {...props} />;
  if (props.control.key === "wrap") return <WrapField {...props} />;
  return <SelectField {...props} />;
}

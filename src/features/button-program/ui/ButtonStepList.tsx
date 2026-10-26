/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ButtonStepList.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The visual step editor: one row per step (kind, fields, move, remove) with
 * nested lists for if / repeat / for-each. It edits the draft only; the
 * popover decides when the draft is saved.
 */

import React, { useState } from "react";

import {
  addStep,
  changeOp,
  moveStep,
  newStep,
  removeStep,
  updateStep,
  valueFromText,
  valueKind,
  valueText,
  withValueKind,
  type DraftStep,
  type ListPath,
  type StepOp,
  type ValueKind,
} from "../model/stepList";
import { DESTRUCTIVE_PAGE_ACTIONS, type ProgramAction, type ProgramValue } from "@/entities/block/model/buttonProgram";

const STEP_LABELS: Record<StepOp, string> = {
  set: "Set a variable",
  if: "If / else",
  repeat: "Repeat",
  forEach: "For each",
  action: "Do an action",
};
const VALUE_LABELS: Record<ValueKind, string> = {
  text: "Text",
  number: "Number",
  boolean: "Yes / no",
  empty: "Empty",
  formula: "Formula",
};
const FIELD = "osio-field px-2 text-sm";
const SMALL_BUTTON =
  "rounded-md border border-[var(--osio-border-default)] px-2 py-1 text-xs text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)] disabled:opacity-40";

const Select = <T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: Record<T, string>;
  onChange: (value: T) => void;
}) => (
  <select aria-label={label} className={FIELD} value={value} onChange={(event) => onChange(event.target.value as T)}>
    {(Object.keys(options) as T[]).map((key) => (
      <option key={key} value={key}>{options[key]}</option>
    ))}
  </select>
);

const ValueField: React.FC<{ label: string; value: ProgramValue; onChange: (value: ProgramValue) => void }> = ({
  label,
  value,
  onChange,
}) => {
  const kind = valueKind(value);
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Select label={`${label} type`} value={kind} options={VALUE_LABELS} onChange={(next) => onChange(withValueKind(next))} />
      {kind === "boolean" && (
        <Select
          label={label}
          value={value ? "true" : "false"}
          options={{ true: "Yes", false: "No" }}
          onChange={(next) => onChange(next === "true")}
        />
      )}
      {(kind === "text" || kind === "number" || kind === "formula") && (
        <input
          aria-label={label}
          className={`${FIELD} min-w-[8rem] flex-1`}
          type={kind === "number" ? "number" : "text"}
          value={valueText(value)}
          onChange={(event) => onChange(valueFromText(value, event.target.value))}
        />
      )}
    </span>
  );
};

const ACTION_LABELS: Record<ProgramAction["type"], string> = {
  notify: "Show a message",
  set_property: "Set a page property",
  page_action: "Run a page action",
  app_action: "Run an app action",
};

const PAGE_ACTION_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(DESTRUCTIVE_PAGE_ACTIONS).map(([name, destructive]) => [
    name,
    `${name.replaceAll("_", " ")}${destructive ? " (asks first)" : ""}`,
  ]),
);

function blankAction(type: ProgramAction["type"]): ProgramAction {
  if (type === "notify") return { type, message: "" };
  if (type === "page_action") return { type, name: Object.keys(DESTRUCTIVE_PAGE_ACTIONS)[0] };
  if (type === "app_action") return { type, name: "", args: {} };
  return { type, property: "", value: "" };
}

const ActionFields: React.FC<{ action: ProgramAction; onChange: (action: ProgramAction) => void }> = ({ action, onChange }) => (
  <div className="flex flex-col gap-1">
    <Select
      label="Action"
      value={action.type}
      options={ACTION_LABELS}
      onChange={(type) => onChange(blankAction(type))}
    />
    {action.type === "notify" && (
      <ValueField label="Message" value={action.message} onChange={(message) => onChange({ ...action, message })} />
    )}
    {action.type === "page_action" && (
      <Select label="Page action" value={action.name} options={PAGE_ACTION_LABELS} onChange={(name) => onChange({ ...action, name })} />
    )}
    {action.type === "set_property" && (
      <>
        <input
          aria-label="Property name"
          className={FIELD}
          placeholder="Property name"
          value={action.property}
          onChange={(event) => onChange({ ...action, property: event.target.value })}
        />
        <ValueField label="Property value" value={action.value} onChange={(value) => onChange({ ...action, value })} />
      </>
    )}
  </div>
);

type Edit = (path: ListPath, index: number, step: DraftStep) => void;

const NameField: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => (
  <input aria-label={label} className={FIELD} placeholder={label} value={value} onChange={(event) => onChange(event.target.value)} />
);

const StepFields: React.FC<{
  step: DraftStep;
  path: ListPath;
  index: number;
  edit: Edit;
  nested: (branch: "else" | "steps", steps: DraftStep[], title: string) => React.ReactNode;
}> = ({ step, path, index, edit, nested }) => {
  const put = (next: DraftStep) => edit(path, index, next);
  switch (step.op) {
    case "set":
      return (
        <div className="flex flex-col gap-1">
          <NameField label="Variable name" value={step.name} onChange={(name) => put({ ...step, name })} />
          <ValueField label="Variable value" value={step.value} onChange={(value) => put({ ...step, value })} />
        </div>
      );
    case "if":
      return (
        <>
          <ValueField label="Condition" value={step.condition} onChange={(condition) => put({ ...step, condition })} />
          {nested("steps", step.steps, "Then")}
          {step.else ? (
            <>
              {nested("else", step.else, "Else")}
              <button type="button" className={SMALL_BUTTON} onClick={() => put({ ...step, else: undefined })}>
                Remove else
              </button>
            </>
          ) : (
            <button type="button" className={SMALL_BUTTON} onClick={() => put({ ...step, else: [] })}>
              Add else
            </button>
          )}
        </>
      );
    case "repeat":
      return (
        <>
          <ValueField label="Times" value={step.count} onChange={(count) => put({ ...step, count })} />
          {nested("steps", step.steps, "Do")}
        </>
      );
    case "forEach":
      return (
        <>
          <ValueField label="Items" value={step.items} onChange={(items) => put({ ...step, items })} />
          <NameField label="Item name" value={step.as} onChange={(as) => put({ ...step, as })} />
          {nested("steps", step.steps, "Do")}
        </>
      );
    case "action":
      return <ActionFields action={step.action} onChange={(action) => put({ ...step, action })} />;
  }
};

const AddStep: React.FC<{ onAdd: (op: StepOp) => void }> = ({ onAdd }) => {
  const [op, setOp] = useState<StepOp>("action");
  return (
    <div className="flex items-center gap-1">
      <Select label="New step kind" value={op} options={STEP_LABELS} onChange={setOp} />
      <button type="button" className={SMALL_BUTTON} onClick={() => onAdd(op)}>
        Add step
      </button>
    </div>
  );
};

interface ListProps {
  draft: DraftStep[];
  path: ListPath;
  onDraft: (next: (draft: DraftStep[]) => DraftStep[]) => void;
}

const StepList: React.FC<ListProps> = ({ draft, path, onDraft }) => {
  const edit: Edit = (listPath, index, step) => onDraft((current) => updateStep(current, listPath, index, () => step));
  return (
    <div className="flex flex-col gap-2">
      {draft.length === 0 && <p className="text-xs text-[var(--osio-fg-muted)]">No steps yet.</p>}
      <ol className="flex flex-col gap-2">
        {draft.map((step, index) => (
          <li key={step.key} className="rounded-md border border-[var(--osio-border-default)] p-2" data-step-op={step.op}>
            <div className="mb-1 flex flex-wrap items-center gap-1">
              <Select
                label="Step kind"
                value={step.op}
                options={STEP_LABELS}
                onChange={(op) => onDraft((current) => changeOp(current, path, index, op))}
              />
              <button type="button" className={SMALL_BUTTON} aria-label="Move step up" disabled={index === 0}
                onClick={() => onDraft((current) => moveStep(current, path, index, -1))}>↑</button>
              <button type="button" className={SMALL_BUTTON} aria-label="Move step down" disabled={index === draft.length - 1}
                onClick={() => onDraft((current) => moveStep(current, path, index, 1))}>↓</button>
              <button type="button" className={SMALL_BUTTON} aria-label="Remove step"
                onClick={() => onDraft((current) => removeStep(current, path, index))}>Remove</button>
            </div>
            <StepFields
              step={step}
              path={path}
              index={index}
              edit={edit}
              nested={(branch, steps, title) => (
                <div className="mt-1 border-l-2 border-[var(--osio-border-default)] pl-2">
                  <p className="mb-1 text-xs font-medium text-[var(--osio-fg-muted)]">{title}</p>
                  <StepList draft={steps} path={[...path, index, branch]} onDraft={onDraft} />
                </div>
              )}
            />
          </li>
        ))}
      </ol>
      <AddStep onAdd={(op) => onDraft((current) => addStep(current, path, newStep(op)))} />
    </div>
  );
};

export const ButtonStepList: React.FC<{ draft: DraftStep[]; onChange: (draft: DraftStep[]) => void }> = ({ draft, onChange }) => (
  <StepList draft={draft} path={[]} onDraft={(next) => onChange(next(draft))} />
);

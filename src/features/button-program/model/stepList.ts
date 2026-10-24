/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   stepList.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The step list the popover edits, and its conversions to and from the AST.
 * The AST stays the single model: a draft step is an AST step plus a UI-only
 * `key` (a stable React key), and toProgram strips it again.
 *
 * Caveat: a draft may be invalid while the user types (an empty variable
 * name); only parseButtonProgram on toProgram(draft) says whether it can be
 * saved, and the popover refuses to save until it parses.
 */

import type { ButtonProgram, ProgramAction, ProgramStep, ProgramValue } from "@/entities/block/model/buttonProgram";

type Keyed = { key: string };
export type DraftStep = Keyed &
  (
    | { op: "set"; name: string; value: ProgramValue }
    | { op: "if"; condition: ProgramValue; steps: DraftStep[]; else?: DraftStep[] }
    | { op: "repeat"; count: ProgramValue; steps: DraftStep[] }
    | { op: "forEach"; items: ProgramValue; as: string; steps: DraftStep[] }
    | { op: "action"; action: ProgramAction }
  );

export type StepOp = ProgramStep["op"];
/** Where a list lives: [] is the program, [1, "else"] the else-branch of step 1. */
export type ListPath = ReadonlyArray<number | "else" | "steps">;

let keySeq = 0;
const nextKey = () => `step-${++keySeq}`;

export function newStep(op: StepOp): DraftStep {
  const key = nextKey();
  switch (op) {
    case "set":
      return { key, op, name: "value", value: "" };
    case "if":
      return { key, op, condition: true, steps: [] };
    case "repeat":
      return { key, op, count: 1, steps: [] };
    case "forEach":
      return { key, op, items: { formula: "" }, as: "item", steps: [] };
    case "action":
      return { key, op, action: { type: "notify", message: "" } };
  }
}

const draftList = (steps: ProgramStep[]): DraftStep[] => steps.map(draftStep);

function draftStep(step: ProgramStep): DraftStep {
  const key = nextKey();
  switch (step.op) {
    case "if": {
      const { steps, else: otherwise, ...rest } = step;
      return { ...rest, key, steps: draftList(steps), ...(otherwise ? { else: draftList(otherwise) } : {}) };
    }
    case "repeat":
    case "forEach":
      return { ...step, key, steps: draftList(step.steps) };
    default:
      return { ...step, key };
  }
}

export const fromProgram = (program: ButtonProgram): DraftStep[] => draftList(program.steps);

function plainStep(step: DraftStep): ProgramStep {
  const { key, ...rest } = step;
  void key; // UI-only; not part of the AST
  switch (rest.op) {
    case "if": {
      const { steps, else: otherwise, ...fields } = rest;
      return { ...fields, steps: steps.map(plainStep), ...(otherwise ? { else: otherwise.map(plainStep) } : {}) };
    }
    case "repeat":
    case "forEach":
      return { ...rest, steps: rest.steps.map(plainStep) };
    default:
      return rest;
  }
}

export const toProgram = (draft: DraftStep[]): ButtonProgram => ({ version: 1, steps: draft.map(plainStep) });

export const programJson = (draft: DraftStep[]): string => JSON.stringify(toProgram(draft), null, 2);

/** Apply `edit` to the list at `path`, rebuilding only the spine that leads to it. */
function editList(list: DraftStep[], path: ListPath, edit: (target: DraftStep[]) => DraftStep[]): DraftStep[] {
  if (path.length === 0) return edit(list);
  const [index, branch, ...rest] = path;
  if (typeof index !== "number" || typeof branch !== "string" || !list[index]) return list;
  const step = list[index];
  const current = (step as unknown as Record<string, DraftStep[] | undefined>)[branch];
  if (!current) return list;
  const next = editList(current, rest, edit);
  return list.map((item, i) => (i === index ? ({ ...item, [branch]: next } as DraftStep) : item));
}

export const addStep = (draft: DraftStep[], path: ListPath, step: DraftStep): DraftStep[] =>
  editList(draft, path, (list) => [...list, step]);

export const removeStep = (draft: DraftStep[], path: ListPath, index: number): DraftStep[] =>
  editList(draft, path, (list) => list.filter((_, i) => i !== index));

export const moveStep = (draft: DraftStep[], path: ListPath, index: number, delta: -1 | 1): DraftStep[] =>
  editList(draft, path, (list) => {
    const target = index + delta;
    if (target < 0 || target >= list.length || !list[index]) return list;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

export const updateStep = (
  draft: DraftStep[],
  path: ListPath,
  index: number,
  edit: (step: DraftStep) => DraftStep,
): DraftStep[] => editList(draft, path, (list) => list.map((step, i) => (i === index ? edit(step) : step)));

export const changeOp = (draft: DraftStep[], path: ListPath, index: number, op: StepOp): DraftStep[] =>
  updateStep(draft, path, index, (step) => (step.op === op ? step : newStep(op)));

export type ValueKind = "text" | "number" | "boolean" | "empty" | "formula";

export function valueKind(value: ProgramValue): ValueKind {
  if (value === null) return "empty";
  if (typeof value === "object") return "formula";
  if (typeof value === "number") return "number";
  return typeof value === "boolean" ? "boolean" : "text";
}

export function withValueKind(kind: ValueKind): ProgramValue {
  switch (kind) {
    case "number":
      return 0;
    case "boolean":
      return true;
    case "empty":
      return null;
    case "formula":
      return { formula: "" };
    default:
      return "";
  }
}

export function valueText(value: ProgramValue): string {
  if (value === null || typeof value === "boolean") return "";
  return typeof value === "object" ? value.formula : String(value);
}

/** Text typed into the field of a value of this kind; a bad number falls back to 0. */
export function valueFromText(current: ProgramValue, text: string): ProgramValue {
  switch (valueKind(current)) {
    case "number": {
      const parsed = Number(text);
      return text.trim() !== "" && Number.isFinite(parsed) ? parsed : 0;
    }
    case "formula":
      return { formula: text };
    case "text":
      return text;
    default:
      return current;
  }
}

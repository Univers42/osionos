/**
 * One write an auto mode applied: what it did, who allowed it, and Undo.
 *
 * The summary is built by the service from what the model wrote: untrusted, so it is a
 * text node. The file holds NO JSX on purpose: the canvas suite renders it under node.
 * Caveat: whether the window has ended is read from the clock of this browser; the
 * service still refuses an expired undo, so a skewed clock shows a button that fails
 * with words, never one that undoes late.
 */

import React from "react";

import type { AppliedRow } from "../model/appliedWrites";

const ROW = "mt-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-muted)] p-2.5 text-xs text-[var(--osio-fg-default)]";
const BUTTON =
  "cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50";
const NOTE = "text-[var(--osio-fg-subtle)]";

/** The modes a row may name (M13); any other `decidedBy` reads "auto", never its raw suffix. */
const MODE_WORDS: ReadonlyMap<string, string> = new Map([
  ["auto:accept_edits", "accept edits"],
  ["auto:auto", "auto"],
]);

const windowEnded = (undoUntil: string): boolean => undoUntil !== "" && Date.parse(undoUntil) < Date.now();

/** The end of the window the service set (M2), as a date in the reader's locale. */
function untilText(undoUntil: string): string {
  const at = new Date(undoUntil);
  return Number.isNaN(at.getTime()) ? "Undo is available" : `Undo until ${at.toLocaleDateString()}`;
}

export interface AppliedWriteRowProps {
  row: AppliedRow;
  onUndo: (approvalId: string) => void;
}

function controls(row: AppliedRow, onUndo: AppliedWriteRowProps["onUndo"]): React.ReactElement | null {
  if (row.undoneAt) return null;
  if (!row.undoable || windowEnded(row.undoUntil)) return React.createElement("p", { className: NOTE }, "Undo is no longer available");
  return React.createElement(
    "div",
    { className: "mt-1 flex items-center gap-2" },
    React.createElement(
      "button",
      { type: "button", className: BUTTON, disabled: row.busy, "aria-label": `Undo: ${row.summary.slice(0, 40)}`, onClick: () => onUndo(row.approvalId) },
      "Undo",
    ),
    React.createElement("span", { className: NOTE }, untilText(row.undoUntil)),
  );
}

/** The row; its status node is always there, so a screen reader hears "Undone" when its text changes (M1). */
export const AppliedWriteRow: React.FC<AppliedWriteRowProps> = ({ row, onUndo }) =>
  React.createElement(
    "div",
    { className: ROW, tabIndex: -1, "data-testid": "chat-applied-write", "data-approval-id": row.approvalId, "data-undone": row.undoneAt ? "true" : "false" },
    React.createElement("p", { className: "break-words" }, row.summary),
    React.createElement("p", { className: NOTE }, `Applied automatically (${MODE_WORDS.get(row.decidedBy) ?? "auto"})`),
    React.createElement("p", { className: NOTE, "aria-live": "polite" }, row.undoneAt ? "Undone" : ""),
    controls(row, onUndo),
    row.error ? React.createElement("p", { role: "alert", className: "mt-1 text-[var(--osio-danger)]" }, row.error) : null,
  );

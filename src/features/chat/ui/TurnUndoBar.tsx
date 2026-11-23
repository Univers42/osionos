/**
 * "Undo all": one button for the writes an auto mode applied in a turn.
 *
 * Shown from two writes up: with one, the row's own Undo is the same act.
 * The service undoes newest first and stops at the first refusal, so the bar can leave
 * some writes applied; its error line says why.
 */

import React from "react";

export interface TurnUndoBarProps {
  count: number;
  busy: boolean;
  error: string;
  onUndoAll: () => void;
}

const BUTTON =
  "cursor-pointer rounded-md border border-[var(--osio-border-default)] px-2 py-1 text-xs font-medium text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50";

export const TurnUndoBar: React.FC<TurnUndoBarProps> = ({ count, busy, error, onUndoAll }) => {
  if (count < 2) return null;
  return React.createElement(
    "div",
    { className: "mt-2 flex flex-wrap items-center gap-2 text-xs", "data-testid": "chat-turn-undo" },
    React.createElement("button", { type: "button", className: BUTTON, disabled: busy, onClick: onUndoAll }, "Undo all"),
    React.createElement("span", { className: "text-[var(--osio-fg-subtle)]" }, `${count} automatic edits in this turn`),
    error ? React.createElement("span", { role: "alert", className: "text-[var(--osio-danger)]" }, error) : null,
  );
};

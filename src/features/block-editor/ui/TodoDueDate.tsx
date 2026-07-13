/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TodoDueDate.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { CalendarClock, CalendarPlus } from "lucide-react";
import { cx } from "@/shared/ui/shared/classNames";

/** Local YYYY-MM-DD for "today" (compared against the stored ISO date). */
function todayKey(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function formatDue(dueAt: string): string {
  const date = new Date(`${dueAt}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dueAt;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A due-date chip on a to_do block. Native <input type="date"> (no picker lib);
 *  the value round-trips as YYYY-MM-DD into block.dueAt → osionos_tasks. */
export const TodoDueDate: React.FC<{ dueAt?: string; checked?: boolean; onChange: (dueAt: string | undefined) => void }> = ({ dueAt, checked, onChange }) => {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={dueAt ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Escape") setEditing(false); }}
        className="mt-[3px] min-w-0 max-w-full shrink rounded border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-1.5 py-0.5 text-xs text-[var(--osio-fg-default)]"
      />
    );
  }

  if (!dueAt) {
    // Floating affordance — absolute so it consumes ZERO layout space (no offset
    // between checkboxes); appears on row hover, pinned to the row's right edge.
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label="Add date"
        title="Add date"
        className="absolute right-1 top-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--osio-fg-subtle)] opacity-0 transition-opacity duration-[120ms] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] group-hover:opacity-100 focus-visible:opacity-100"
      >
        <CalendarPlus size={14} aria-hidden />
      </button>
    );
  }

  const overdue = !checked && dueAt < todayKey();
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={`Due ${formatDue(dueAt)} — change date`}
      title="Change due date"
      className={cx(
        "mt-[3px] inline-flex min-w-0 max-w-full items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-[var(--osio-bg-hover)]",
        overdue ? "text-[var(--osio-danger)]" : "text-[var(--osio-fg-muted)]",
      )}
    >
      <CalendarClock size={12} aria-hidden className="shrink-0" />
      <span className="min-w-0 truncate">{formatDue(dueAt)}</span>
    </button>
  );
};

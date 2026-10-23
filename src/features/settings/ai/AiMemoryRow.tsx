/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AiMemoryRow.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * One memory in Settings › AI memory: its text, its buttons, and the inline
 * editor. The body is a memory the model wrote — untrusted — so it is only
 * ever a text node (no markup, no markdown).
 */

import React, { useState } from "react";

import { MEMORY_BODY_MAX, validateMemoryBody, type AiMemory } from "@/features/ai/model/memories";
import { DANGER_BUTTON, FIELD_INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./aiPanelClasses";

export interface AiMemoryRowProps {
  memory: AiMemory;
  busy: boolean;
  onApprove(): void;
  onReject(): void;
  onRemove(): void;
  /** Saves the trimmed text; the row closes its editor when the promise resolves true. */
  onSave(body: string): Promise<boolean>;
}

const label = (action: string, body: string): string => `${action}: ${body.slice(0, 40)}`;

export const AiMemoryRow: React.FC<AiMemoryRowProps> = ({ memory, busy, onApprove, onReject, onRemove, onSave }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const problem = draft === null ? null : validateMemoryBody(draft);

  if (draft !== null) {
    return (
      <li className="rounded-md border border-[var(--osio-border-default)] p-2.5">
        <textarea
          rows={3}
          className={FIELD_INPUT}
          aria-label={label("Edit text", memory.body)}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <p className="mt-1 text-xs text-[var(--osio-fg-muted)]" aria-live="polite">{draft.length} / {MEMORY_BODY_MAX}</p>
        {problem && !problem.ok && <p className="mt-1 text-xs text-[var(--osio-danger)]">{problem.message}</p>}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className={PRIMARY_BUTTON}
            disabled={busy || !problem?.ok}
            aria-label={label("Save", memory.body)}
            onClick={() => { if (problem?.ok) void onSave(problem.body).then((saved) => { if (saved) setDraft(null); }); }}
          >Save</button>
          <button type="button" className={SECONDARY_BUTTON} aria-label={label("Cancel", memory.body)} onClick={() => setDraft(null)}>Cancel</button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-md border border-[var(--osio-border-default)] p-2.5">
      <p className="whitespace-pre-wrap break-words text-sm text-[var(--osio-fg-default)]">{memory.body}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {memory.status === "proposed" && (
          <>
            <button type="button" className={SECONDARY_BUTTON} disabled={busy} aria-label={label("Approve", memory.body)} onClick={onApprove}>Approve</button>
            <button type="button" className={DANGER_BUTTON} disabled={busy} aria-label={label("Reject", memory.body)} onClick={onReject}>Reject</button>
          </>
        )}
        <button type="button" className={SECONDARY_BUTTON} disabled={busy} aria-label={label("Edit", memory.body)} onClick={() => setDraft(memory.body)}>Edit</button>
        {memory.status === "approved" && (
          <button type="button" className={DANGER_BUTTON} disabled={busy} aria-label={label("Remove", memory.body)} onClick={onRemove}>Remove</button>
        )}
      </div>
    </li>
  );
};

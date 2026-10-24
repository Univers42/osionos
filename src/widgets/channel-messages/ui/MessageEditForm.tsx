/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MessageEditForm.tsx                                :+:      :+:    :+:   */
/*                                                    +#+  :+:         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+   +#+           */
/*   Created: 2026/10/22 15:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 15:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The inline edit form of a message.
 *
 * It stays OPEN until the write really happened: a moderation warning is L0's
 * question (the notice answers it — "Save anyway" resends with the author's
 * answer, "Edit" puts the caret back in the text), any other failure is one
 * line of text. The author's edit is never lost to a failure — before, the
 * form closed on every answer and the edit vanished.
 */

import React, { useRef, useState } from 'react';

import { ModerationWarningNotice } from '@/shared/moderation/ModerationWarningNotice';
import type { ModerationWarning } from '@/shared/moderation/moderationWarning';
import { Button } from '@/shared/ui';

import type { SendOutcome } from '../model/channelWrites';

interface MessageEditFormProps {
  messageId: string;
  /** The text the message carries now — the form starts from it. */
  content: string;
  /** Saves the edit. The answer is typed: a warning is not a failure. */
  onEdit: (
    messageId: string,
    content: string,
    options?: { acknowledgeWarning?: boolean },
  ) => Promise<SendOutcome> | SendOutcome;
  /** Closes the form: the author cancelled, or the write happened. */
  onClose: () => void;
}

export const MessageEditForm: React.FC<MessageEditFormProps> = ({ messageId, content, onEdit, onClose }) => {
  const [draft, setDraft] = useState(content);
  const [warning, setWarning] = useState<ModerationWarning | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (options?: { acknowledgeWarning?: boolean }) => {
    setSaving(true);
    setFailed(null);
    try {
      const outcome = await onEdit(messageId, draft, options);
      if (outcome.ok) {
        onClose();
        return;
      }
      // L0 asked first: the notice answers it and the form stays open.
      if ('warning' in outcome) {
        setWarning(outcome.warning);
        return;
      }
      setFailed("Couldn't save your edit — try again.");
    } catch {
      setFailed("Couldn't save your edit — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(event) => { event.preventDefault(); void submit(); }}
      className="mt-1 flex flex-wrap items-center gap-2"
    >
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}
        className="min-w-0 flex-1 rounded-xs border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1 text-sm outline-none focus:border-[var(--osio-accent)]"
      />
      <Button type="submit" tone="primary" size="sm" disabled={saving}>Save</Button>
      <Button tone="ghost" size="sm" onClick={onClose}>Cancel</Button>
      {/* The warning is announced, not shouted: the author hears it once. */}
      {warning && (
        <div aria-live="polite" className="w-full">
          <ModerationWarningNotice
            warning={warning}
            onEdit={() => { setWarning(null); inputRef.current?.focus(); }}
            onConfirm={() => void submit({ acknowledgeWarning: true })}
            confirmLabel="Save anyway"
          />
        </div>
      )}
      {failed && <p className="w-full text-xs text-[var(--osio-danger)]">{failed}</p>}
    </form>
  );
};

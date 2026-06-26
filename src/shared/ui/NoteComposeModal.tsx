/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   NoteComposeModal.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Generic "compose a note + submit" modal. Reused by the connection intro-note
 * flow (ConnectNoteModal) and Collaboration's request-to-join. Wraps Modal +
 * Button + a plain textarea; the note is optional and trimmed before submit.
 */

import React, { useState } from 'react';

import { Button } from '@/shared/ui/atoms/Button';
import { Modal } from '@/shared/ui/primitives/Modal';

interface NoteComposeModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void | Promise<void>;
  title: string;
  description?: string;
  placeholder?: string;
  submitLabel?: string;
  maxLength?: number;
}

export const NoteComposeModal: React.FC<NoteComposeModalProps> = ({
  open,
  onClose,
  onSubmit,
  title,
  description,
  placeholder = 'Add a note (optional)…',
  submitLabel = 'Send',
  maxLength = 280,
}) => {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit(note.trim());
      setNote('');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="sm">
      <div className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-[var(--osio-fg-default)]">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-[var(--osio-fg-muted)]">{description}</p>
          ) : null}
        </div>
        <textarea
          autoFocus
          value={note}
          maxLength={maxLength}
          onChange={(event) => setNote(event.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full resize-none rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-page)] px-3 py-2 text-sm text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--osio-fg-subtle)]">{note.length}/{maxLength}</span>
          <div className="flex items-center gap-2">
            <Button tone="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button tone="primary" onClick={submit} disabled={busy}>
              {busy ? 'Sending…' : submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

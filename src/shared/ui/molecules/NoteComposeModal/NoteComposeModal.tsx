/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   NoteComposeModal.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/28 19:28:10 by serjimen         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Generic "compose a note + submit" modal. Reused by the connection intro-note
 * flow (ConnectNoteModal) and Collaboration's request-to-join. Wraps Modal +
 * Button + a plain textarea; the note is optional and trimmed before submit.
 */

import React, { useEffect, useState } from 'react';

import { Button } from '@osionos/ui/atoms/Button';
import { Modal } from '@osionos/ui/primitives/Modal';

import {
  extractErrorMessage,
  formatCharacterCount,
  isSubmitShortcut,
  sanitizeNote,
} from './noteComposeUtils';

interface NoteComposeModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void | Promise<void>;
  title: string;
  description?: string;
  placeholder?: string;
  submitLabel?: string;
  maxLength?: number;
  initialNote?: string;
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
  initialNote = '',
}) => {
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote(initialNote);
      setError(null);
    }
  }, [open, initialNote]);

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(sanitizeNote(note));
      setNote('');
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to send note. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNote(event.target.value);
    if (error) setError(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isSubmitShortcut(event)) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title={title} description={description} size="sm">
      <div className="flex flex-col gap-4 p-5">
        <div>
          <h2
            aria-hidden="true"
            className="text-base font-semibold text-[var(--osio-fg-default)]"
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm text-[var(--osio-fg-muted)]">{description}</p>
          ) : null}
        </div>
        {error ? (
          <div
            role="alert"
            className="rounded-md border border-[color-mix(in_srgb,var(--osio-danger)_24%,transparent)] bg-[color-mix(in_srgb,var(--osio-danger)_12%,transparent)] px-3 py-2 text-xs text-[var(--osio-danger)]"
          >
            {error}
          </div>
        ) : null}
        <textarea
          autoFocus
          value={note}
          maxLength={maxLength}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label={title || 'Note content'}
          placeholder={placeholder}
          rows={4}
          className="w-full resize-none rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-page)] px-3 py-2 text-sm text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--osio-fg-subtle)]" aria-live="polite">
            {formatCharacterCount(note.length, maxLength)}
          </span>
          <div className="flex items-center gap-2">
            <Button tone="ghost" onClick={handleClose} disabled={busy}>
              Cancel
            </Button>
            <Button tone="primary" onClick={submit} disabled={busy}>
              {busy ? 'Sending…' : submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

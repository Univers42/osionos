/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AltTextDialog.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface AltTextDialogProps {
  value: string;
  onSave: (alt: string) => void;
  onClose: () => void;
}

/** Small modal for editing an image's alt text (accessibility describe-text). */
export const AltTextDialog: React.FC<AltTextDialogProps> = ({ value, onSave, onClose }) => {
  const [draft, setDraft] = useState(value);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    areaRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = useCallback(() => {
    onSave(draft.trim());
    onClose();
  }, [draft, onClose, onSave]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit alt text"
      onClick={onClose}
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-[var(--osio-overlay)] p-6"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4 shadow-xl"
      >
        <h2 className="mb-1 text-sm font-semibold text-[var(--osio-fg-default)]">Alt text</h2>
        <p className="mb-3 text-xs text-[var(--osio-fg-muted)]">
          Describe this image for screen readers and when it fails to load.
        </p>
        <textarea
          ref={areaRef}
          value={draft}
          rows={3}
          aria-label="Alt text"
          placeholder="Describe this image…"
          onChange={(event) => setDraft(event.target.value)}
          className="w-full resize-none rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)] focus:border-[var(--osio-accent)]"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--osio-border-default)] px-3 py-1.5 text-sm text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-md bg-[var(--osio-accent)] px-3 py-1.5 text-sm font-semibold text-[var(--osio-accent-fg)] transition-opacity hover:opacity-90"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LinkEditorPanel.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { Copy, ExternalLink, Unlink } from "lucide-react";

export interface LinkEditorAnchor {
  left: number;
  top: number;
  bottom: number;
}

interface LinkEditorPanelProps {
  text: string;
  href: string;
  rect: LinkEditorAnchor;
  onApply: (next: { text: string; href: string }) => void;
  onOpenUrl: (href: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

const FIELD_CLASS =
  "w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1.5 text-sm text-[var(--osio-fg-default)] outline-none focus:border-[var(--osio-accent)]";
const ACTION_CLASS =
  "flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]";

export const LinkEditorPanel: React.FC<LinkEditorPanelProps> = ({
  text,
  href,
  rect,
  onApply,
  onOpenUrl,
  onRemove,
  onClose,
}) => {
  const [draftText, setDraftText] = useState(text);
  const [draftHref, setDraftHref] = useState(href);

  const commit = () => onApply({ text: draftText.trim(), href: draftHref.trim() });

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      onClose();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      data-link-editor-panel
      data-testid="inline-link-editor"
      className="fixed z-[var(--osio-z-max)] w-80 space-y-2 rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-3 shadow-xl"
      style={{
        left: Math.min(rect.left, (globalThis.innerWidth ?? 800) - 340),
        top: Math.max(12, rect.bottom + 8),
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--osio-fg-subtle)]">
        Text
        <input
          className={`mt-1 ${FIELD_CLASS}`}
          value={draftText}
          placeholder="Link text"
          onChange={(event) => setDraftText(event.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
      </label>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--osio-fg-subtle)]">
        URL
        <input
          className={`mt-1 ${FIELD_CLASS}`}
          value={draftHref}
          placeholder="https://…"
          autoFocus
          onChange={(event) => setDraftHref(event.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
      </label>
      <div className="flex items-center justify-between pt-1">
        <button type="button" className={ACTION_CLASS} onClick={() => onOpenUrl(draftHref.trim())}>
          <ExternalLink size={13} /> Open
        </button>
        <button type="button" className={ACTION_CLASS} onClick={() => navigator.clipboard?.writeText(draftHref.trim())}>
          <Copy size={13} /> Copy
        </button>
        <button
          type="button"
          className={`${ACTION_CLASS} hover:text-[var(--osio-danger)]`}
          onClick={onRemove}
        >
          <Unlink size={13} /> Remove
        </button>
      </div>
    </div>
  );
};

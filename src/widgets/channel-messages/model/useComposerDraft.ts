/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useComposerDraft.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Composer draft state: the text, the pending DRAFT attachments[] (descriptors
 * the bridge returned from /api/chat/uploads, not-yet-sent), and the slash-menu
 * anchor rect derived from the live caret via Range.getClientRects(). The
 * orchestrator reads `attachments` and passes them straight to actions.send().
 */

import { useCallback, useEffect, useState } from 'react';

import type { Attachment } from '@/shared/chat/messageApi';

/** Persisted only when a storageKey is given (per-channel); read-once on mount. */
function readDraft(storageKey?: string): string {
  if (!storageKey) return '';
  try { return localStorage.getItem(storageKey) ?? ''; } catch { return ''; }
}

export interface SlashAnchor {
  x: number;
  y: number;
  top: number;
}

/** Caret rect from the textarea selection → fixed-viewport coords for the menu. */
export function caretAnchor(textarea: HTMLTextAreaElement): SlashAnchor {
  const rect = textarea.getBoundingClientRect();
  // Textareas have no Range; approximate the caret line off scroll + a mirror is
  // overkill here. Anchor to the textarea's top-left line so the menu opens at a
  // stable, visible point above the composer (LinkedIn/WhatsApp do the same).
  return { x: rect.left + 8, y: rect.top, top: rect.top };
}

export function useComposerDraft(storageKey?: string) {
  const [text, setText] = useState(() => readDraft(storageKey));
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [slashAnchor, setSlashAnchor] = useState<SlashAnchor | null>(null);
  const [slashFilter, setSlashFilter] = useState('');

  // Persist the unsent text per channel so switching/reloading doesn't lose it.
  // Attachments stay ephemeral (their blob: previews die across a reload anyway).
  useEffect(() => {
    if (!storageKey) return;
    try {
      if (text.trim()) localStorage.setItem(storageKey, text);
      else localStorage.removeItem(storageKey);
    } catch { /* private mode / quota — best-effort */ }
  }, [text, storageKey]);

  const addAttachment = useCallback((attachment: Attachment) => {
    setAttachments((current) => [...current, attachment]);
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((current) => current.filter((_, i) => i !== index));
  }, []);

  const reset = useCallback(() => {
    setText('');
    setAttachments([]);
    setSlashAnchor(null);
    setSlashFilter('');
    if (storageKey) { try { localStorage.removeItem(storageKey); } catch { /* ignore */ } }
  }, [storageKey]);

  const closeSlash = useCallback(() => {
    setSlashAnchor(null);
    setSlashFilter('');
  }, []);

  return {
    text,
    setText,
    attachments,
    addAttachment,
    removeAttachment,
    reset,
    slashAnchor,
    setSlashAnchor,
    slashFilter,
    setSlashFilter,
    closeSlash,
  };
}

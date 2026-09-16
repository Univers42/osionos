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

import { useCallback, useEffect, useRef, useState } from 'react';

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

/** Trailing debounce for draft persistence — one localStorage write per typing
 * burst instead of one per keystroke (a synchronous write blocks the hot path). */
const PERSIST_DEBOUNCE_MS = 400;

export function useComposerDraft(storageKey?: string) {
  const [text, setText] = useState(() => readDraft(storageKey));
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [slashAnchor, setSlashAnchor] = useState<SlashAnchor | null>(null);
  const [slashFilter, setSlashFilter] = useState('');

  // Persist the unsent text per channel so switching/reloading doesn't lose it.
  // Attachments stay ephemeral (their blob: previews die across a reload anyway).
  // `text` changes every keystroke, so a synchronous localStorage write per change
  // stutters typing — coalesce into one trailing write, flushed synchronously on
  // teardown (unmount / channel switch) so a pending draft is never dropped.
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraft = useRef<{ key: string; text: string } | null>(null);

  const flushDraft = useCallback(() => {
    if (persistTimer.current !== null) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    const pending = pendingDraft.current;
    if (!pending) return;
    pendingDraft.current = null;
    try {
      if (pending.text.trim()) localStorage.setItem(pending.key, pending.text);
      else localStorage.removeItem(pending.key);
    } catch { /* private mode / quota — best-effort */ }
  }, []);

  useEffect(() => {
    if (!storageKey) return;
    pendingDraft.current = { key: storageKey, text };
    if (persistTimer.current !== null) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(flushDraft, PERSIST_DEBOUNCE_MS);
  }, [text, storageKey, flushDraft]);

  // Flush the pending write before the key changes and on unmount, so the
  // debounce never drops the last keystrokes.
  useEffect(() => {
    if (!storageKey) return undefined;
    return flushDraft;
  }, [storageKey, flushDraft]);

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
    // Cancel any pending debounced write so it can't resurrect the cleared draft.
    if (persistTimer.current !== null) { clearTimeout(persistTimer.current); persistTimer.current = null; }
    pendingDraft.current = null;
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

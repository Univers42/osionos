/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageTitle.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { focusPageEditorStart } from '@/features/block-editor/model/blockDomFocus';
import { applyEmojiInsert, matchEmojiTrigger } from '@/shared/lib/emoji/emojiTrigger';
import { parseIconValue } from '@osionos/ui/shared/iconValue';
import { EmojiPicker } from '@/shared/ui';

interface PageTitleProps {
  /** Current page title. */
  title: string;
  /** Called when user edits the title. */
  onChangeTitle: (title: string) => void;
  readOnly?: boolean;
}

function fitToContent(textarea: HTMLTextAreaElement) {
  textarea.style.height = '0px';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

/**
 * Editable page title matching osionos's styling.
 * Pressing Enter moves focus to the first content block.
 *
 * Typing `:` (start of the title or after a space) opens the shared emoji
 * picker and filters as you keep typing — the same trigger rule block text
 * uses, from shared/lib/emoji, so the two can never drift. Only emoji are
 * inserted here: a title is plain text, so an icon/SVG pick (which becomes
 * markdown image syntax in a block) is ignored rather than pasted as `![](…)`.
 */
export const PageTitle: React.FC<PageTitleProps> = ({ title, onChangeTitle, readOnly = false }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [emojiFilter, setEmojiFilter] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (ref.current) fitToContent(ref.current);
  }, [title]);

  // A narrower window wraps the title onto more lines without changing its text.
  // Only a width change re-measures: setting the height fires the observer again
  // with the same width, which would otherwise loop.
  useEffect(() => {
    const textarea = ref.current;
    if (!textarea || typeof ResizeObserver === 'undefined') return undefined;
    let lastWidth = textarea.clientWidth;
    const observer = new ResizeObserver(() => {
      if (textarea.clientWidth === lastWidth) return;
      lastWidth = textarea.clientWidth;
      fitToContent(textarea);
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    const next = e.target.value;
    onChangeTitle(next);
    // Match against the text BEFORE the caret so a `:` typed mid-title triggers
    // on what the user is actually completing, not on the trailing remainder.
    const upToCaret = next.slice(0, e.target.selectionStart ?? next.length);
    const match = matchEmojiTrigger(upToCaret);
    setEmojiFilter(match ? match.filter : null);
  }, [onChangeTitle, readOnly]);

  // Close on a pointerdown OUTSIDE the title+picker. Deliberately not `onBlur`:
  // clicking an emoji blurs the textarea, so a blur-close unmounted the picker
  // before its click could land — the pick never registered.
  useEffect(() => {
    if (emojiFilter === null) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setEmojiFilter(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [emojiFilter]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && emojiFilter !== null) {
      e.preventDefault();
      setEmojiFilter(null);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      focusPageEditorStart("start");
    }
  }, [emojiFilter]);

  const handleEmojiSelect = useCallback((value: string) => {
    setEmojiFilter(null);
    const parsed = parseIconValue(value);
    if (parsed?.kind !== 'emoji') return; // titles hold text, not markdown images
    onChangeTitle(applyEmojiInsert(title, parsed.ref));
    ref.current?.focus();
  }, [onChangeTitle, title]);

  return (
    <div className="relative" ref={wrapRef}>
      <textarea
        ref={ref}
        aria-label="Page title"
        name="page-title"
        autoComplete="off"
        spellCheck
        rows={1}
        value={title}
        placeholder="Untitled"
        className="osionos-page-title osio-display"
        readOnly={readOnly}
        aria-readonly={readOnly}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      {emojiFilter !== null && !readOnly ? (
        <div className="absolute left-0 top-full z-[var(--osio-z-popover)]" data-testid="title-emoji-picker">
          <EmojiPicker
            initialQuery={emojiFilter}
            onSelect={handleEmojiSelect}
            onRemove={() => undefined}
            onClose={() => setEmojiFilter(null)}
          />
        </div>
      ) : null}
    </div>
  );
};

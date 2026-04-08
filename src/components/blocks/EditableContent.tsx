/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EditableContent.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:24 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:04:25 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * EditableContent — standalone contentEditable block component.
 * Replaces the external @src/components/blocks/EditableContent.
 */
import React, { useCallback, useEffect, useRef } from 'react';

interface EditableContentProps {
  content: string;
  className?: string;
  placeholder?: string;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * A contentEditable div that syncs text with the parent via onChange.
 * Supports placeholder text via data-placeholder attribute.
 */
export const EditableContent: React.FC<EditableContentProps> = ({
  content,
  className = '',
  placeholder = '',
  onChange,
  onKeyDown,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);

  // Sync content from props (only when it diverges from DOM text)
  useEffect(() => {
    if (ref.current && ref.current.textContent !== content) {
      ref.current.textContent = content;
    }
  }, [content]);

  const handleInput = useCallback(() => {
    if (isComposing.current) return;
    const text = ref.current?.textContent ?? '';
    onChange(text);
  }, [onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown(e);
    },
    [onKeyDown],
  );

  return (
    <div
      ref={ref}
      role="textbox"
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      data-placeholder={placeholder}
      className={`outline-none whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--color-ink-faint)] ${className}`}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onCompositionStart={() => { isComposing.current = true; }}
      onCompositionEnd={() => {
        isComposing.current = false;
        handleInput();
      }}
    />
  );
};

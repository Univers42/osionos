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
import React, { useCallback, useEffect, useRef } from "react";
import { parseInlineMarkdown } from "@/shared/lib/markengine";

interface EditableContentProps {
  content: string;
  className?: string;
  placeholder?: string;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void;
}

/**
 * A contentEditable div that syncs text with the parent via onChange.
 * Supports placeholder text via data-placeholder attribute.
 */
export const EditableContent: React.FC<EditableContentProps> = ({
  content,
  className = "",
  placeholder = "",
  onChange,
  onKeyDown,
  onPaste,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);
  const isFocused = useRef(false);

  // Sync content from props (raw text while editing, parsed HTML while blurred)
  useEffect(() => {
    if (!ref.current) return;
    if (isFocused.current) {
      if (ref.current.textContent !== content) {
        ref.current.textContent = content;
      }
      return;
    }

    const html = content ? parseInlineMarkdown(content) : "";
    if (ref.current.innerHTML !== html) {
      ref.current.innerHTML = html;
    }
  }, [content]);

  const handleInput = useCallback(() => {
    if (isComposing.current) return;
    const text = ref.current?.textContent ?? "";
    onChange(text);
  }, [onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown(e);
    },
    [onKeyDown],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      onPaste?.(e);
    },
    [onPaste],
  );

  return (
    <div // NOSONAR - contentEditable is required for this Notion-like editor UX
      ref={ref}
      role="textbox"
      aria-multiline="true"
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      data-placeholder={placeholder}
      className={`outline-none whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--color-ink-faint)] empty:before:pointer-events-none focus:empty:before:content-none ${className}`}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onFocus={() => {
        isFocused.current = true;
        if (!ref.current) return;
        ref.current.textContent = content;
      }}
      onBlur={() => {
        isFocused.current = false;
        if (!ref.current) return;
        ref.current.innerHTML = content ? parseInlineMarkdown(content) : "";
      }}
      onCompositionStart={() => {
        isComposing.current = true;
      }}
      onCompositionEnd={() => {
        isComposing.current = false;
        handleInput();
      }}
    />
  );
};

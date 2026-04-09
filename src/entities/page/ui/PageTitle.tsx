/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageTitle.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:47:31 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useRef } from 'react';

interface PageTitleProps {
  /** Current page title. */
  title: string;
  /** Called when user edits the title. */
  onChangeTitle: (title: string) => void;
}

/**
 * ContentEditable H1 title matching Notion's styling.
 * Pressing Enter moves focus to the first content block.
 */
export const PageTitle: React.FC<PageTitleProps> = ({ title, onChangeTitle }) => {
  const ref = useRef<HTMLDivElement>(null);

  /* Sync DOM when title changes externally */
  useEffect(() => {
    if (ref.current && ref.current.textContent !== title) {
      ref.current.textContent = title;
    }
  }, [title]);

  const handleInput = useCallback(() => {
    if (!ref.current) return;
    onChangeTitle(ref.current.textContent ?? '');
  }, [onChangeTitle]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      /* Move focus to the first block editor */
      const firstBlock = document.querySelector(
        '[data-block-id] [contenteditable], [data-block-id] textarea',
      ) as HTMLElement | null;
      firstBlock?.focus();
    }
  }, []);

  return (
    <div
      ref={ref}
      role="textbox"
      aria-label="Page title"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      className="notion-page-title"
      data-placeholder="Untitled"
      onInput={handleInput}
      onKeyDown={handleKeyDown}
    />
  );
};

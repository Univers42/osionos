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

import React, { useCallback, useLayoutEffect, useRef } from 'react';
import { focusPageEditorStart } from '@/features/block-editor/model/blockDomFocus';

interface PageTitleProps {
  /** Current page title. */
  title: string;
  /** Called when user edits the title. */
  onChangeTitle: (title: string) => void;
}

/**
 * Editable page title matching Notion's styling.
 * Pressing Enter moves focus to the first content block.
 */
export const PageTitle: React.FC<PageTitleProps> = ({ title, onChangeTitle }) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = '0px';
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [title]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChangeTitle(e.target.value);
  }, [onChangeTitle]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      focusPageEditorStart("start");
    }
  }, []);

  return (
    <textarea
      ref={ref}
      aria-label="Page title"
      spellCheck
      rows={1}
      value={title}
      placeholder="Untitled"
      className="notion-page-title"
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  );
};

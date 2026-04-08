/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TodoBlockEditor.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback } from 'react';

import { EditableContent } from '@src/components/blocks/EditableContent';
import type { Block } from '@src/types/database';

import { usePageStore } from '../store/usePageStore';


export const TodoBlockEditor: React.FC<{
  block: Block;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}> = ({ block, onChange, onKeyDown }) => {
  const updateBlock = usePageStore(s => s.updateBlock);
  const page       = usePageStore(s => s.activePage);

  const toggleChecked = useCallback(() => {
    if (!page) return;
    updateBlock(page.id, block.id, { checked: !block.checked });
  }, [page, block.id, block.checked, updateBlock]);

  return (
    <div className="flex items-start gap-2 pl-1">
      <button
        type="button"
        onClick={toggleChecked}
        className={[
          'shrink-0 mt-[3px] w-4 h-4 rounded border flex items-center justify-center cursor-pointer',
          block.checked
            ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
            : 'border-[var(--color-line)] bg-[var(--color-surface-primary)] hover:border-[var(--color-ink-muted)]',
        ].join(' ')}
      >
        {block.checked && (
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
            <path d="M4 8l2.5 2.5L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
      <div className="flex-1">
        <EditableContent
          content={block.content}
          className={[
            'text-sm leading-relaxed py-0.5',
            block.checked ? 'text-[var(--color-ink-muted)] line-through' : 'text-[var(--color-ink)]',
          ].join(' ')}
          placeholder="To-do"
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
};

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ToggleBlockEditor.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

import { EditableContent } from '@src/components/blocks/EditableContent';
import type { Block } from '@src/types/database';


export const ToggleBlockEditor: React.FC<{
  block: Block;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}> = ({ block, onChange, onKeyDown }) => {
  const [expanded, setExpanded] = useState(!block.collapsed);

  return (
    <div className="pl-0.5">
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={() => setExpanded(o => !o)}
          className="shrink-0 mt-[3px] w-5 h-5 rounded hover:bg-[var(--color-surface-hover)] flex items-center justify-center"
        >
          <ChevronRight
            size={14}
            className={[
              'text-[var(--color-ink-muted)] transition-transform duration-150',
              expanded ? 'rotate-90' : '',
            ].join(' ')}
          />
        </button>
        <div className="flex-1">
          <EditableContent
            content={block.content}
            className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5"
            placeholder="Toggle"
            onChange={onChange}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
      {expanded && block.children && block.children.length > 0 && (
        <div className="ml-6 mt-0.5 pl-3 border-l-2 border-[var(--color-line)]">
          {block.children.map(child => (
            <p key={child.id} className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5">
              {child.content}
            </p>
          ))}
        </div>
      )}
      {expanded && (!block.children || block.children.length === 0) && (
        <div className="ml-6 mt-0.5 pl-3 border-l-2 border-[var(--color-line)]">
          <span className="text-xs text-[var(--color-ink-faint)] py-1 italic">Empty toggle</span>
        </div>
      )}
    </div>
  );
};

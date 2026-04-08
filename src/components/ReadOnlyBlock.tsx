/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ReadOnlyBlock.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import type { Block } from '@src/types/database';
import { ChevronRight } from 'lucide-react';
import { DatabaseBlock } from '@src/components/DatabaseBlock';
import { CalloutBlockReadOnly } from './CalloutBlockReadOnly';
import { CodeBlockReadOnly } from './CodeBlockReadOnly';

interface BlockProps {
  block: Block;
  index: number;
}

export const ReadOnlyBlock: React.FC<BlockProps> = ({ block, index }) => {
  switch (block.type) {
    case 'paragraph':
      return (
        <p className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5 min-h-[1.5em]">
          {block.content || <span className="text-[var(--color-ink-faint)]">&nbsp;</span>}
        </p>
      );

    case 'heading_1':
      return <h1 className="text-2xl font-bold text-[var(--color-ink)] mt-6 mb-1 leading-tight">{block.content}</h1>;
    case 'heading_2':
      return <h2 className="text-xl font-semibold text-[var(--color-ink)] mt-5 mb-1 leading-tight">{block.content}</h2>;
    case 'heading_3':
      return <h3 className="text-lg font-semibold text-[var(--color-ink)] mt-4 mb-0.5 leading-snug">{block.content}</h3>;
    case 'heading_4':
      return <h4 className="text-base font-semibold text-[var(--color-ink)] mt-3 mb-0.5 leading-snug">{block.content}</h4>;
    case 'heading_5':
      return <h5 className="text-sm font-semibold text-[var(--color-ink)] mt-2 mb-0.5 leading-snug">{block.content}</h5>;
    case 'heading_6':
      return <h6 className="text-xs font-semibold text-[var(--color-ink-muted)] mt-2 mb-0.5 leading-snug uppercase tracking-wide">{block.content}</h6>;

    case 'bulleted_list':
      return (
        <div className="flex items-start gap-2 pl-1">
          <span className="text-sm leading-relaxed py-0.5 select-none shrink-0 w-5 text-center">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-ink-faint)] mt-[7px]" />
          </span>
          <span className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5 flex-1">{block.content}</span>
        </div>
      );

    case 'numbered_list':
      return (
        <div className="flex items-start gap-2 pl-1">
          <span className="text-sm leading-relaxed py-0.5 text-[var(--color-ink-muted)] select-none shrink-0 w-5 text-center font-medium">
            {index + 1}.
          </span>
          <span className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5 flex-1">{block.content}</span>
        </div>
      );

    case 'to_do':
      return (
        <div className="flex items-start gap-2 pl-1">
          <span
            className={[
              'shrink-0 mt-[3px] w-4 h-4 rounded border flex items-center justify-center',
              block.checked
                ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-white'
                : 'border-[var(--color-line)] bg-[var(--color-surface-primary)]',
            ].join(' ')}
          >
            {block.checked && (
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
                <path d="M4 8l2.5 2.5L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </span>
          <span className={[
            'text-sm leading-relaxed py-0.5 flex-1',
            block.checked ? 'text-[var(--color-ink-muted)] line-through' : 'text-[var(--color-ink)]',
          ].join(' ')}>
            {block.content}
          </span>
        </div>
      );

    case 'code':
      return <CodeBlockReadOnly block={block} />;

    case 'quote':
      return (
        <div className="flex my-0.5">
          <div className="w-1 bg-[var(--color-ink)] rounded-full shrink-0 mr-3" />
          <span className="text-sm text-[var(--color-ink-muted)] leading-relaxed py-0.5 italic flex-1">
            {block.content}
          </span>
        </div>
      );

    case 'callout':
      return <CalloutBlockReadOnly block={block} />;

    case 'divider':
      return (
        <div className="py-2">
          <hr className="border-[var(--color-line)]" />
        </div>
      );

    case 'database_inline':
    case 'database_full_page':
      return (
        <DatabaseBlock
          databaseId={block.databaseId}
          initialViewId={block.viewId}
          mode="inline"
        />
      );

    case 'toggle':
      return <ToggleBlockReadOnly block={block} />;

    default:
      // Fallback: render as paragraph
      return (
        <p className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5">
          {block.content}
        </p>
      );
  }
};

const ToggleBlockReadOnly: React.FC<{ block: Block }> = ({ block }) => {
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
        <button type="button" className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5 flex-1 cursor-pointer select-none text-left" onClick={() => setExpanded(o => !o)}>
          {block.content}
        </button>
      </div>
      {expanded && block.children && block.children.length > 0 && (
        <div className="ml-6 mt-0.5 pl-3 border-l-2 border-[var(--color-line)]">
          {block.children.map((child, i) => (
            <ReadOnlyBlock key={child.id} block={child} index={i} />
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

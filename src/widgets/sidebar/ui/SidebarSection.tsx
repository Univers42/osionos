/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SidebarSection.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/04 14:03:44 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import { ChevronDown, Plus, MoreHorizontal } from 'lucide-react';

interface Props {
  label:         string;
  children?:     React.ReactNode;
  defaultOpen?:  boolean;
  onAdd?:        () => void;     // shows a "+" button on hover when provided
  onMore?:       () => void;     // shows a "⋯" button on hover when provided
}

/**
 * Collapsible section header used to group rows in the sidebar.
 * Matches Notion's styling: 12px font, 30px height, lowercase label,
 * chevron + action buttons on hover.
 */
export const SidebarSection: React.FC<Props> = ({
  label, children, defaultOpen = true, onAdd, onMore,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-3">
      {/* Section header row – matches Notion's 30px height */}
      <div className="group relative flex items-center h-[30px] px-2 mb-px">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 flex-1 min-w-0 rounded-[6px] h-full hover:bg-[var(--color-surface-hover)] px-1.5 -mx-1.5"
        >
          <span className="text-[12px] leading-none font-medium text-[var(--color-ink-faint)] truncate">
            {label}
          </span>
          <ChevronDown
            size={12}
            className={[
              'text-[var(--color-ink-faint)] shrink-0 transition-transform duration-100',
              'opacity-0 group-hover:opacity-100',
              open ? '' : '-rotate-90',
            ].join(' ')}
          />
        </button>

        {/* Action buttons – appear on hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {onMore && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMore(); }}
              className="p-0.5 rounded text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]"
              title="Open menu"
            >
              <MoreHorizontal size={14} />
            </button>
          )}
          {onAdd && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAdd(); }}
              className="p-0.5 rounded text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]"
              title={`Add to ${label}`}
            >
              <Plus size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Content (collapsed → nothing rendered) */}
      {open && <div className="flex flex-col gap-px">{children}</div>}
    </div>
  );
};

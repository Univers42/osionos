/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageTreeItem.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/04 23:14:06 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState, useMemo } from 'react';
import { ChevronRight, Plus, MoreHorizontal, File, Database } from 'lucide-react';
import { usePageStore, type PageEntry } from '../../store/usePageStore';

interface Props {
  page:        PageEntry;
  workspaceId: string;
  jwt:         string;
  depth?:      number;
  activeId?:   string | null;
}

/**
 * Recursive page tree row.
 * – Indent: depth × 12 px left offset
 * – Hover reveals ⋯ (actions) and + (add child) buttons
 * – Click opens the page in MainContent
 */
export const PageTreeItem: React.FC<Props> = ({
  page, workspaceId, jwt, depth = 0, activeId,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [hovered,  setHovered]  = useState(false);

  const openPage = usePageStore(s => s.openPage);
  const addPage  = usePageStore(s => s.addPage);

  // Access raw pages array (stable reference) and derive children outside selector
  const wsPages   = usePageStore(s => s.pages[workspaceId]);
  const children  = useMemo(
    () => (wsPages ?? []).filter(p => p.parentPageId === page._id && !p.archivedAt),
    [wsPages, page._id],
  );
  const isActive  = activeId === page._id;
  const hasChildren = children.length > 0;
  const paddingLeft = 10 + depth * 12;

  const Icon = page.databaseId ? Database : File;

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    openPage({
      id:          page._id,
      workspaceId,
      kind:        page.databaseId ? 'database' : 'page',
      title:       page.title,
      icon:        page.icon,
    });
  }

  async function handleAddChild(e: React.MouseEvent) {
    e.stopPropagation();
    const child = await addPage(workspaceId, 'Untitled', jwt, page._id);
    if (child) {
      setExpanded(true);
      openPage({ id: child._id, workspaceId, kind: 'page', title: child.title });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={[
          'group relative w-full flex items-center gap-0.5 h-7 rounded-md text-sm select-none',
          'transition-colors duration-100 cursor-pointer',
          isActive
            ? 'bg-[var(--color-surface-tertiary)] text-[var(--color-ink)]'
            : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]',
        ].join(' ')}
        style={{ paddingLeft, paddingRight: 4 }}
      >
        {/* Expand/collapse chevron */}
        <button
          type="button"
          className="flex items-center justify-center w-5 h-5 shrink-0 rounded hover:bg-[var(--color-surface-hover)]"
          onClick={e => { e.stopPropagation(); setExpanded(o => !o); }}
        >
          {hasChildren
            ? (
              <ChevronRight
                size={12}
                className={['transition-transform duration-150', expanded ? 'rotate-90' : ''].join(' ')}
              />
            )
            : <Icon size={13} className="opacity-50" />}
        </button>

        {/* Page icon */}
        {page.icon
          ? <span className="text-sm leading-none">{page.icon}</span>
          : <Icon size={13} className="opacity-40 shrink-0" />}

        {/* Title */}
        <span className="flex-1 text-left truncate ml-1">{page.title || 'Untitled'}</span>

        {/* Action buttons — appear on hover */}
        {hovered && (
          <span className="flex items-center gap-0.5 mr-0.5 shrink-0">
            <button
              type="button"
              className="p-1 rounded hover:bg-[var(--color-surface-secondary)]"
              onClick={e => e.stopPropagation()}
              title="More"
            >
              <MoreHorizontal size={13} />
            </button>
            <button
              type="button"
              className="p-1 rounded hover:bg-[var(--color-surface-secondary)]"
              onClick={handleAddChild}
              title="Add child page"
            >
              <Plus size={13} />
            </button>
          </span>
        )}
      </button>

      {/* Recurse for children */}
      {expanded && hasChildren && children.map(child => (
        <PageTreeItem
          key={child._id}
          page={child}
          workspaceId={workspaceId}
          jwt={jwt}
          depth={depth + 1}
          activeId={activeId}
        />
      ))}
    </>
  );
};

/* ************************************************************************** */
/*                                                                            */
/*   LibraryTree.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur         #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

import React, { Fragment } from "react";
import { Building2, ChevronRight, Lock, Plus, Users } from "lucide-react";
import { IconValueView } from "@osionos/ui/atoms/IconValueView";
import type { PageEntry } from "@/entities/page";
import { formatRelativeTime } from "@/shared/lib/relativeTime";
import { initialsOf } from "@osionos/ui";
import { isSharedPage, ownerName, sourceLabel, sourceParent, type LibraryNode } from "../model/pageLibraryModel";

export const LIBRARY_GRID = "grid grid-cols-[minmax(220px,2.4fr)_minmax(140px,1.1fr)_minmax(140px,1.1fr)_150px_150px] items-center";

interface SharedProps {
  names: ReadonlyMap<string, string>;
  workspaceName: string;
  pagesById: ReadonlyMap<string, PageEntry>;
  visited: ReadonlyMap<string, number>;
  expanded: ReadonlySet<string>;
  onToggle: (pageId: string) => void;
  onOpen: (page: PageEntry) => void;
  onAddChild: (parentId: string | null) => void;
}

const AddNewRow: React.FC<{ depth: number; parentId: string | null; onAddChild: (parentId: string | null) => void }> = ({ depth, parentId, onAddChild }) => (
  <div className="h-9 border-b border-[var(--osio-border-soft)]">
    <button
      type="button"
      data-testid="library-add-new"
      onClick={() => onAddChild(parentId)}
      className="flex h-9 w-full items-center gap-1.5 text-sm text-[var(--osio-fg-subtle)] transition-colors duration-(--osio-dur-fast) hover:text-[var(--osio-fg-default)]"
      style={{ paddingLeft: `${8 + depth * 20}px` }}
    >
      <Plus size={14} aria-hidden="true" />
      <span>Add new</span>
    </button>
  </div>
);

const Owner: React.FC<{ ownerId: string | null | undefined; names: ReadonlyMap<string, string> }> = ({ ownerId, names }) => {
  const name = ownerName(ownerId, names);
  if (!name) return <span className="text-[var(--osio-fg-subtle)]">—</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden="true"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--osio-bg-subtle)] text-3xs font-semibold text-[var(--osio-fg-muted)]"
      >
        {initialsOf(name)}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
};

/** Where the page lives: a nested page names its parent (icon + title), a
 *  top-level one its audience, as Notion's Source column does. */
const Source: React.FC<{ page: PageEntry; workspaceName: string; pagesById: ReadonlyMap<string, PageEntry> }> = ({ page, workspaceName, pagesById }) => {
  const parent = sourceParent(page, pagesById);
  if (parent) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center"><IconValueView value={parent.icon ?? "icon:page"} size={14} /></span>
        <span className="truncate">{parent.title || "Untitled"}</span>
      </span>
    );
  }
  const label = sourceLabel(page, workspaceName);
  let Icon = Lock;
  if (page.visibility === "public") Icon = Building2;
  else if (isSharedPage(page)) Icon = Users;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon size={14} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
};

const LibraryRow: React.FC<SharedProps & { node: LibraryNode }> = ({ node, names, workspaceName, pagesById, visited, expanded, onToggle, onOpen }) => {
  const { page, depth, children } = node;
  const hasChildren = children.length > 0;
  const isExpanded = hasChildren && expanded.has(page._id);
  const lastVisited = visited.get(page._id);
  const title = page.title || "Untitled";

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      data-testid="library-row"
      data-page-id={page._id}
      className={`group ${LIBRARY_GRID} h-9 cursor-default border-b border-[var(--osio-border-soft)] text-sm text-[var(--osio-fg-default)] transition-colors duration-(--osio-dur-fast) hover:bg-[var(--osio-bg-hover)]`}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button")) onOpen(page);
      }}
    >
      <div className="flex min-w-0 items-center gap-1" style={{ paddingLeft: `${8 + depth * 20}px` }}>
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${title}`}
            data-testid="library-chevron"
            onClick={() => onToggle(page._id)}
            className="grid h-5 w-5 shrink-0 place-items-center rounded-[var(--osio-radius-chip)] text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-muted)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
          >
            <ChevronRight size={14} className={isExpanded ? "rotate-90 transition-transform duration-(--osio-dur-fast)" : "transition-transform duration-(--osio-dur-fast)"} />
          </button>
        ) : (
          <span aria-hidden="true" className="h-5 w-5 shrink-0" />
        )}
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--osio-fg-muted)]">
          <IconValueView value={page.icon ?? "icon:page"} size={15} />
        </span>
        <button
          type="button"
          onClick={() => onOpen(page)}
          className="min-w-0 truncate text-left text-sm text-[var(--osio-fg-default)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
        >
          {title}
        </button>
        <button
          type="button"
          data-testid="library-open"
          aria-label={`Open ${title}`}
          onClick={() => onOpen(page)}
          className="ml-1 shrink-0 rounded-full border border-[var(--osio-border-default)] px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide text-[var(--osio-fg-muted)] opacity-0 transition-opacity duration-(--osio-dur-fast) group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
        >
          Open
        </button>
      </div>
      <div className="min-w-0 truncate px-2 text-[var(--osio-fg-muted)]"><Owner ownerId={page.ownerId} names={names} /></div>
      <div className="min-w-0 px-2 text-[var(--osio-fg-muted)]"><Source page={page} workspaceName={workspaceName} pagesById={pagesById} /></div>
      <div className="truncate px-2 text-[var(--osio-fg-muted)]">{formatRelativeTime(lastVisited) || "—"}</div>
      <div className="truncate px-2 text-[var(--osio-fg-muted)]">{formatRelativeTime(page.updatedAt) || "—"}</div>
    </div>
  );
};

/** Draws the rows the user has expanded, adding a muted "Add new" row at the end
 *  of every expanded level. Collapsed subtrees render no rows at all. */
export const LibraryTree: React.FC<SharedProps & { nodes: readonly LibraryNode[] }> = (props) => {
  const { nodes, expanded } = props;
  const renderLevel = (level: readonly LibraryNode[]): React.ReactNode => level.map((node) => {
    const open = node.children.length > 0 && expanded.has(node.page._id);
    return (
      <Fragment key={node.page._id}>
        <LibraryRow {...props} node={node} />
        {open ? (
          <div role="group">
            {renderLevel(node.children)}
            <AddNewRow depth={node.depth + 1} parentId={node.page._id} onAddChild={props.onAddChild} />
          </div>
        ) : null}
      </Fragment>
    );
  });

  return (
    <div role="tree" aria-label="Pages" className="min-w-[800px]">
      {renderLevel(nodes)}
      <AddNewRow depth={0} parentId={null} onAddChild={props.onAddChild} />
    </div>
  );
};

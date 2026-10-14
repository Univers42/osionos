/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WorkspaceExplorerRow.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { useDragSession } from "@/store/dragSession";
import { useIsActivePage } from "@/store/activePageFlag";

import type { VisibleItem } from "../model/explorerRows";
import { useExplorer } from "./explorerContext";
import { IdeInlineInput } from "./IdeInlineInput";
import { ExplorerRowIcon } from "./ExplorerRowIcon";

export const EXPLORER_DRAG_MIME = "application/x-osio-workspace-path";
/** Height the virtualizer assumes before a line is measured: the sidebar page row's 28px. */
export const EXPLORER_ROW_HEIGHT_PX = 28;
// The sidebar page row's indent grid (SidebarNavItem: 10px + 12px per level), so a
// file row at depth 0 starts where a page row does.
const INDENT_BASE_PX = 10;
const INDENT_STEP_PX = 12;
const indentOf = (level: number) => ({ paddingLeft: INDENT_BASE_PX + (level - 1) * INDENT_STEP_PX });

// The sidebar page row's look (SidebarNavItem in the kit), so the tree and the
// Recents above it read as one list. The kit row spells its 6px radius and 28px
// height as literals, so they are repeated here until it moves to a token;
// explorerRows.spec.mjs fails if the two lists drift apart.
const ROW =
  "flex h-7 cursor-pointer select-none items-center gap-2 rounded-[6px] pr-2 text-base font-medium transition-colors duration-(--osio-dur-fast)";
const ROW_ACTIVE = "bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]";
const ROW_IDLE = "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]";
/** Where the virtualized list puts one line: its index, its offset, and the callback
 *  that measures its real height. */
export type LinePlacement = { index: number; start: number; measure: (node: Element | null) => void };

const placed = ({ index, start, measure }: LinePlacement) => ({
  ref: measure,
  "data-index": index,
  style: { position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${start}px)` } as const,
});

// The focus ring is the global :focus-visible rule on the li (it has a tabindex); the
// radius makes that ring follow the row's corners.
const ROW_FOCUS = "list-none rounded-[6px]";

/** Drag source + drop target props for one row; a drop lands in the row itself
 *  when it is a folder, otherwise in its folder. */
function useRowDnd(rel: string, dropDir: string, renaming: boolean, pageId: string | undefined) {
  const { moveTo } = useExplorer();
  const [dragOver, setDragOver] = React.useState(false);
  const props = {
    draggable: !renaming,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData(EXPLORER_DRAG_MIME, rel);
      event.dataTransfer.effectAllowed = "move";
      if (pageId) {
        event.dataTransfer.setData("text/plain", pageId);
        useDragSession.getState().beginDrag(pageId);
      }
    },
    onDragOver: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes(EXPLORER_DRAG_MIME)) return;
      event.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDragOver(false);
      const from = event.dataTransfer.getData(EXPLORER_DRAG_MIME);
      if (from && from !== rel) moveTo(from, dropDir);
    },
    onDragEnd: () => useDragSession.getState().endDrag(),
  };
  return { props, dragOver };
}

/** One treeitem. The tree is flat: aria-level/setsize/posinset carry the nesting. */
export const WorkspaceExplorerRow: React.FC<{ item: VisibleItem; placement: LinePlacement }> = ({ item, placement }) => {
  const ctx = useExplorer();
  const { rel, row, level } = item;
  const isDir = row.kind === "dir";
  const open = isDir && ctx.expanded.has(rel);
  const renaming = ctx.pending?.type === "rename" && ctx.pending.rel === rel;
  const pageId = ctx.pageIdOf?.(rel, row.kind);
  const active = useIsActivePage(pageId ?? "");
  const dnd = useRowDnd(rel, isDir ? rel : item.parentRel, renaming, pageId);

  const onContextMenu = (event: React.MouseEvent): void => {
    if (renaming) return;
    event.preventDefault();
    event.stopPropagation();
    ctx.openMenu(rel, row, { x: event.clientX, y: event.clientY });
  };

  return (
    <li
      {...placed(placement)}
      role="treeitem"
      data-rel={rel}
      aria-level={level}
      aria-setsize={item.setSize}
      aria-posinset={item.posInSet}
      aria-expanded={isDir ? open : undefined}
      aria-selected={active}
      tabIndex={ctx.tabbableRel === rel ? 0 : -1}
      onFocus={(event) => { if (event.target === event.currentTarget) ctx.focusRow(rel); }}
      className={ROW_FOCUS}
    >
      <div
        {...dnd.props}
        onClick={() => ctx.activate(rel, row)}
        onContextMenu={onContextMenu}
        style={indentOf(level)}
        className={`${ROW} ${active ? ROW_ACTIVE : ROW_IDLE}${dnd.dragOver ? " outline outline-1 -outline-offset-1 outline-[var(--osio-accent)]" : ""}`}
      >
        <ExplorerRowIcon item={item} open={open} pageId={pageId} />
        {renaming ? (
          <IdeInlineInput
            initialValue={row.name}
            label={`Rename ${row.name}`}
            placeholder="Rename"
            onSubmit={(name) => ctx.submitRename(rel, name)}
            onCancel={ctx.cancelEdit}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-left">{row.label || "Untitled"}</span>
        )}
      </div>
    </li>
  );
};

/** Loading / error line of an expanded folder whose rows are not there yet. */
export const ExplorerStatusRow: React.FC<{ dir: string; level: number; placement: LinePlacement }> = ({ dir, level, placement }) => {
  const ctx = useExplorer();
  const state = ctx.dirs[dir];
  return (
    <li {...placed(placement)} role="none">
      <div style={indentOf(level)} className="flex min-h-7 flex-wrap items-center gap-x-1 pr-2 text-xs text-[var(--osio-fg-muted)]">
        {state?.status === "error" ? (
          <>
            Could not read this folder: {state.message}{" "}
            <button type="button" onClick={() => ctx.retry(dir)} className="rounded-xs underline hover:text-[var(--osio-fg-default)]">Retry</button>
          </>
        ) : "Loading…"}
      </div>
    </li>
  );
};

/** The inline name input of a pending create, first among its folder's rows. */
export const ExplorerCreateRow: React.FC<{ level: number; kind: "file" | "dir"; placement: LinePlacement }> = ({ level, kind, placement }) => {
  const ctx = useExplorer();
  const label = kind === "dir" ? "New folder name" : "New file name";
  const line = placed(placement);
  return (
    <li {...line} role="none" style={{ ...line.style, ...indentOf(level) }} className="flex h-7 items-center pr-2">
      <IdeInlineInput label={label} placeholder={label} onSubmit={ctx.submitCreate} onCancel={ctx.cancelEdit} />
    </li>
  );
};

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
import { ChevronDown, ChevronRight, FileCode2, FileText, Folder, FolderOpen } from "lucide-react";

import { languageForFileName } from "../model/ideLanguages";
import { visibleItemOf, type VisibleItem } from "../model/explorerRows";
import { useExplorer } from "./explorerContext";
import { IdeInlineInput } from "./IdeInlineInput";

export const EXPLORER_DRAG_MIME = "application/x-osio-workspace-path";
const ICON = "shrink-0";
// Same indent grid as IdeInlineInput (8px gutter + 12px per level) so inline rows line up.
const INDENT_BASE_PX = 8;
const INDENT_STEP_PX = 12;
const indentOf = (level: number) => ({ paddingLeft: INDENT_BASE_PX + (level - 1) * INDENT_STEP_PX });
const ROW_FOCUS = "list-none outline-none [&:focus-visible>div]:outline [&:focus-visible>div]:outline-2 [&:focus-visible>div]:-outline-offset-2 [&:focus-visible>div]:outline-[var(--osio-accent)]";

const RowIcon: React.FC<{ item: VisibleItem; open: boolean }> = ({ item, open }) => {
  const { kind, name } = item.row;
  if (kind === "dir") {
    const Chevron = open ? ChevronDown : ChevronRight;
    const FolderIcon = open ? FolderOpen : Folder;
    return (
      <>
        <Chevron size={14} className={`${ICON} opacity-70`} />
        <FolderIcon size={14} className={ICON} />
      </>
    );
  }
  // 14px spacer keeps files aligned with folder labels.
  return (
    <>
      <span className="w-[14px] shrink-0" aria-hidden="true" />
      {kind === "page"
        ? <FileText size={13} className={ICON} />
        : <FileCode2 size={13} className={ICON} style={{ color: languageForFileName(name).accent }} />}
    </>
  );
};

/** Drag source + drop target props for one row; a drop lands in the row itself
 *  when it is a folder, otherwise in its folder. */
function useRowDnd(rel: string, dropDir: string, renaming: boolean) {
  const { moveTo } = useExplorer();
  const [dragOver, setDragOver] = React.useState(false);
  const props = {
    draggable: !renaming,
    onDragStart: (event: React.DragEvent) => { event.dataTransfer.setData(EXPLORER_DRAG_MIME, rel); event.dataTransfer.effectAllowed = "move"; },
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
  };
  return { props, dragOver };
}

/** One treeitem. Folders own a role="group" branch of their children. */
export const WorkspaceExplorerRow: React.FC<{ item: VisibleItem }> = ({ item }) => {
  const ctx = useExplorer();
  const { rel, row, level } = item;
  const isDir = row.kind === "dir";
  const open = isDir && ctx.expanded.has(rel);
  const renaming = ctx.pending?.type === "rename" && ctx.pending.rel === rel;
  const dnd = useRowDnd(rel, isDir ? rel : item.parentRel, renaming);

  return (
    <li
      role="treeitem"
      data-rel={rel}
      aria-level={level}
      aria-setsize={item.setSize}
      aria-posinset={item.posInSet}
      aria-expanded={isDir ? open : undefined}
      aria-selected={ctx.activeRel === rel}
      tabIndex={ctx.tabbableRel === rel ? 0 : -1}
      onFocus={(event) => { if (event.target === event.currentTarget) ctx.focusRow(rel); }}
      className={ROW_FOCUS}
    >
      <div
        {...dnd.props}
        onClick={() => ctx.activate(rel, row)}
        style={indentOf(level)}
        className={
          "flex cursor-pointer items-center gap-1.5 py-[3px] pr-2 text-[13px] text-[var(--osio-code-fg)] " +
          (ctx.activeRel === rel ? "bg-[var(--osio-code-active-line)] " : "hover:bg-[var(--osio-code-btn-hover)] ") +
          (dnd.dragOver ? "outline outline-1 outline-[var(--osio-accent)]" : "")
        }
      >
        <RowIcon item={item} open={open} />
        {renaming ? (
          <IdeInlineInput
            initialValue={row.name}
            label={`Rename ${row.name}`}
            placeholder="Rename"
            depth={0}
            onSubmit={(name) => ctx.submitRename(rel, name)}
            onCancel={ctx.cancelEdit}
          />
        ) : (
          <span className="flex-1 truncate">{row.label || "Untitled"}</span>
        )}
      </div>
      {open && <ExplorerBranch dir={rel} level={level + 1} />}
    </li>
  );
};

/** Loading / error placeholder for a folder whose rows are not on screen yet. */
const BranchStatus: React.FC<{ dir: string; level: number; role: string }> = ({ dir, level, role }) => {
  const ctx = useExplorer();
  const state = ctx.dirs[dir];
  return (
    <ul role={role}>
      <li role="none" style={indentOf(level)} className="py-[3px] pr-2 text-[12px] text-[var(--osio-code-fg-muted)]">
        {state?.status === "error" ? (
          <>
            Could not read this folder: {state.message}{" "}
            <button type="button" onClick={() => ctx.retry(dir)} className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--osio-accent)]">Retry</button>
          </>
        ) : "Loading…"}
      </li>
    </ul>
  );
};

/** The children of one directory: lazy states, the inline create row, then rows. */
export const ExplorerBranch: React.FC<{ dir: string; level: number; root?: boolean }> = ({ dir, level, root = false }) => {
  const ctx = useExplorer();
  const state = ctx.dirs[dir];
  const role = root ? "tree" : "group";
  const creating = ctx.pending?.type === "create" && ctx.pending.parent === dir ? ctx.pending : null;

  if (state?.status !== "ready") return <BranchStatus dir={dir} level={level} role={role} />;
  return (
    <ul role={role} aria-label={root ? "Workspace files" : undefined} className="m-0 p-0">
      {creating && (
        <li role="none">
          <IdeInlineInput
            depth={level - 1}
            label={creating.kind === "dir" ? "New folder name" : "New file name"}
            placeholder={creating.kind === "dir" ? "New folder name" : "New file name"}
            onSubmit={ctx.submitCreate}
            onCancel={ctx.cancelEdit}
          />
        </li>
      )}
      {state.rows.map((row, index) => (
        <WorkspaceExplorerRow key={row.name} item={visibleItemOf(dir, row, index, state.rows.length, level)} />
      ))}
    </ul>
  );
};

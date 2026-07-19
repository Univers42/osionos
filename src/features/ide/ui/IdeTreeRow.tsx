/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeTreeRow.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { ChevronDown, ChevronRight, FileCode2, FilePlus, FolderPlus, Pencil, Trash2 } from "lucide-react";

import type { IdeTreeNode } from "../model/ideFileTree";
import { languageForFileName } from "../model/ideLanguages";
import { useIdeTree } from "./ideTreeContext";
import { IdeInlineInput } from "./IdeInlineInput";

const DRAG_MIME = "application/x-osio-ide-page";

/** One explorer row: drag-to-move, hover actions (rename / delete, plus new
 *  file/folder on folders), inline rename, and recursive children with an inline
 *  create row. All interaction state comes from the tree context. */
export const IdeTreeRow: React.FC<{ node: IdeTreeNode; depth: number }> = ({ node, depth }) => {
  const tree = useIdeTree();
  const [dragOver, setDragOver] = React.useState(false);
  const id = node.page._id;
  const isOpen = tree.expanded.has(id);
  const isActive = tree.activeId === id;

  if (tree.renamingId === id) {
    return (
      <IdeInlineInput
        initialValue={node.page.title}
        depth={depth}
        onSubmit={(name) => tree.submitRename(id, name)}
        onCancel={tree.cancelRename}
      />
    );
  }

  const onDrop = (event: React.DragEvent): void => {
    event.preventDefault();
    event.stopPropagation(); // do not also bubble to the root drop zone
    setDragOver(false);
    const dragged = event.dataTransfer.getData(DRAG_MIME);
    if (dragged && dragged !== id) tree.ops.move(dragged, node.isFolder ? id : node.page.parentPageId ?? null);
  };

  return (
    <>
      <div
        role="treeitem"
        aria-expanded={node.isFolder ? isOpen : undefined}
        draggable
        onDragStart={(event) => event.dataTransfer.setData(DRAG_MIME, id)}
        onDragOver={node.isFolder ? (event) => { event.preventDefault(); setDragOver(true); } : undefined}
        onDragLeave={node.isFolder ? () => setDragOver(false) : undefined}
        onDrop={onDrop}
        onClick={() => (node.isFolder ? tree.toggle(id) : tree.openFile(node))}
        style={{ paddingLeft: 8 + depth * 12 }}
        className={
          "group flex cursor-pointer items-center gap-1.5 py-[3px] pr-1 text-[13px] " +
          (isActive
            ? "bg-[var(--osio-code-active-line,rgba(127,127,127,0.14))] text-[var(--osio-code-fg)] "
            : "text-[var(--osio-code-fg)] hover:bg-[var(--osio-code-btn-hover,rgba(127,127,127,0.10))] ") +
          (dragOver ? "outline outline-1 outline-[var(--osio-accent)]" : "")
        }
      >
        {node.isFolder ? (
          isOpen ? <ChevronDown size={14} className="shrink-0 opacity-70" /> : <ChevronRight size={14} className="shrink-0 opacity-70" />
        ) : (
          <FileCode2 size={13} className="shrink-0" style={{ color: languageForFileName(node.page.title).accent }} />
        )}
        <span className="flex-1 truncate">{node.page.title || "Untitled"}</span>
        <span className="hidden shrink-0 items-center gap-0.5 pr-1 group-hover:flex">
          {node.isFolder && (
            <>
              <RowAction title="New file" onClick={() => tree.startCreate(id, "code")}><FilePlus size={13} /></RowAction>
              <RowAction title="New folder" onClick={() => tree.startCreate(id, "folder")}><FolderPlus size={13} /></RowAction>
            </>
          )}
          <RowAction title="Rename" onClick={() => tree.startRename(id)}><Pencil size={12} /></RowAction>
          <RowAction title="Delete" onClick={() => tree.ops.remove(id)}><Trash2 size={12} /></RowAction>
        </span>
      </div>

      {node.isFolder && isOpen && (
        <>
          {tree.create && tree.create.parentId === id && (
            <IdeInlineInput
              depth={depth + 1}
              placeholder={tree.create.kind === "folder" ? "folder name" : "file name"}
              onSubmit={tree.submitCreate}
              onCancel={tree.cancelCreate}
            />
          )}
          {node.children.map((child) => (
            <IdeTreeRow key={child.page._id} node={child} depth={depth + 1} />
          ))}
        </>
      )}
    </>
  );
};

const RowAction: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({ title, onClick, children }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={(event) => { event.stopPropagation(); onClick(); }}
    className="flex h-5 w-5 items-center justify-center rounded text-[var(--osio-code-fg-muted)] hover:bg-[var(--osio-code-btn-hover,rgba(127,127,127,0.16))] hover:text-[var(--osio-code-fg)]"
  >
    {children}
  </button>
);

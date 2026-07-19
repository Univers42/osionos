/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeFileTree.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { ChevronDown, ChevronRight, FileCode2 } from "lucide-react";

import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { buildIdeFileTree, type IdeTreeNode } from "../model/ideFileTree";
import { languageForFileName } from "../model/ideLanguages";

/** Read-only file explorer over the workspace's folder + code pages. Clicking a
 *  file opens it in the active pane through the normal page-open path; P1 layers
 *  create/rename/delete/drag on top of this same tree. */
export const IdeFileTree: React.FC = () => {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const pages = usePageStore((s) => s.pages[workspaceId]) ?? EMPTY;
  const openPage = usePageStore((s) => s.openPage);
  const activeId = usePageStore((s) => s.activePage?.id ?? null);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());

  const tree = React.useMemo(() => buildIdeFileTree(pages), [pages]);

  const toggle = React.useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onOpenFile = React.useCallback(
    (node: IdeTreeNode) => {
      openPage({ id: node.page._id, workspaceId, kind: "page", title: node.page.title });
    },
    [openPage, workspaceId],
  );

  if (tree.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-[11px] leading-5 text-[var(--osio-code-fg-muted)]">
        No code files yet. Create one from the sidebar (New code file) to start a project.
      </p>
    );
  }

  return (
    <div role="tree" className="py-1 text-[13px] text-[var(--osio-code-fg)]">
      {tree.map((node) => (
        <IdeTreeRow
          key={node.page._id}
          node={node}
          depth={0}
          expanded={expanded}
          activeId={activeId}
          onToggle={toggle}
          onOpenFile={onOpenFile}
        />
      ))}
    </div>
  );
};

const EMPTY: never[] = [];

interface RowProps {
  node: IdeTreeNode;
  depth: number;
  expanded: Set<string>;
  activeId: string | null;
  onToggle: (id: string) => void;
  onOpenFile: (node: IdeTreeNode) => void;
}

const IdeTreeRow: React.FC<RowProps> = ({ node, depth, expanded, activeId, onToggle, onOpenFile }) => {
  const isOpen = expanded.has(node.page._id);
  const isActive = activeId === node.page._id;
  const accent = node.isFolder ? undefined : languageForFileName(node.page.title).accent;
  const pad = 8 + depth * 12;

  return (
    <>
      <button
        type="button"
        role="treeitem"
        aria-expanded={node.isFolder ? isOpen : undefined}
        onClick={() => (node.isFolder ? onToggle(node.page._id) : onOpenFile(node))}
        style={{ paddingLeft: pad }}
        className={
          "flex w-full items-center gap-1.5 py-[3px] pr-2 text-left " +
          (isActive
            ? "bg-[var(--osio-code-active-line,rgba(127,127,127,0.14))] text-[var(--osio-code-fg)]"
            : "hover:bg-[var(--osio-code-btn-hover,rgba(127,127,127,0.10))]")
        }
      >
        {node.isFolder ? (
          isOpen ? <ChevronDown size={14} className="shrink-0 opacity-70" /> : <ChevronRight size={14} className="shrink-0 opacity-70" />
        ) : (
          <FileCode2 size={13} className="shrink-0" style={{ color: accent }} />
        )}
        <span className="truncate">{node.page.title || "Untitled"}</span>
      </button>
      {node.isFolder && isOpen &&
        node.children.map((child) => (
          <IdeTreeRow
            key={child.page._id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            activeId={activeId}
            onToggle={onToggle}
            onOpenFile={onOpenFile}
          />
        ))}
    </>
  );
};

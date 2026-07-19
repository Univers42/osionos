/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideFileTree.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";

/** One node of the IDE file tree — a folder page or a code-file page. */
export interface IdeTreeNode {
  page: PageEntry;
  isFolder: boolean;
  children: IdeTreeNode[];
}

/** A page participates in the IDE tree when it is a live folder or code file. */
function isIdeTreePage(page: PageEntry): boolean {
  return !page.archivedAt && (page.surface === "folder" || page.surface === "code");
}

/** Folders first, then files, each alphabetically by title — VS Code ordering. */
function compareNodes(a: IdeTreeNode, b: IdeTreeNode): number {
  if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
  return (a.page.title || "").localeCompare(b.page.title || "");
}

function sortTree(nodes: IdeTreeNode[]): IdeTreeNode[] {
  nodes.sort(compareNodes);
  for (const node of nodes) sortTree(node.children);
  return nodes;
}

/**
 * Build the IDE file tree from a workspace's pages. The filesystem is the page
 * tree: a folder page's `parent_page_id` children are its entries; a code page
 * is a leaf file. A child whose parent is not itself an IDE page (or is null)
 * becomes a root — so code files created at the workspace root show at the top.
 */
export function buildIdeFileTree(pages: PageEntry[]): IdeTreeNode[] {
  const treePages = pages.filter(isIdeTreePage);
  const byId = new Map<string, IdeTreeNode>();
  for (const page of treePages) {
    byId.set(page._id, { page, isFolder: page.surface === "folder", children: [] });
  }

  const roots: IdeTreeNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.page.parentPageId;
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return sortTree(roots);
}

/** Flatten the tree depth-first (folders expanded), for search / keyboard nav. */
export function flattenIdeTree(nodes: IdeTreeNode[]): IdeTreeNode[] {
  const out: IdeTreeNode[] = [];
  const walk = (list: IdeTreeNode[]): void => {
    for (const node of list) {
      out.push(node);
      if (node.children.length) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

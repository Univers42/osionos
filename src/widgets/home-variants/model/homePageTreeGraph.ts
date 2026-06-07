/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homePageTreeGraph.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";
import type { HomeGraphLink, HomeGraphNode } from "./homeKnowledgeGraphData";

export interface PageTreeInput {
  id: string;
  title: string;
  parentPageId?: string | null;
  isFolder: boolean;
  relations: string[];
}

/** Project osionos workspace pages into graph input (folders flagged, relations extracted). */
export function toPageTreeInput(pages: readonly PageEntry[] | undefined): PageTreeInput[] {
  return (pages ?? []).filter((page) => !page.archivedAt).map((page) => ({
    id: page._id,
    title: page.title,
    parentPageId: page.parentPageId,
    isFolder: page.surface === "folder",
    relations: (page.properties ?? [])
      .filter((property) => property.type === "relation")
      .flatMap((property) => (Array.isArray(property.value)
        ? property.value.filter((value): value is string => typeof value === "string")
        : [])),
  }));
}

/**
 * Folder/file nodes + edges for the Second Brain graph: a folder is a "gap" node (distinct
 * colour) that only links/organizes — it emits a "contains" edge to each child, and pages
 * emit "relation" edges from their relation properties.
 */
export function pageTreeGraph(pages: readonly PageTreeInput[]): { nodes: HomeGraphNode[]; links: HomeGraphLink[] } {
  const childCount = new Map<string, number>();
  for (const page of pages) {
    if (page.parentPageId) childCount.set(page.parentPageId, (childCount.get(page.parentPageId) ?? 0) + 1);
  }
  const ids = new Set(pages.map((page) => page.id));
  const nodes = pages.map((page) => makePageNode(page, childCount.get(page.id) ?? 0));
  const links: HomeGraphLink[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    if (page.parentPageId && ids.has(page.parentPageId)) {
      addLink(links, seen, page.parentPageId, page.id, "contains", 1.6);
    }
    for (const target of page.relations) {
      if (target !== page.id && ids.has(target)) addLink(links, seen, page.id, target, "relation", 1.2);
    }
  }
  return { nodes, links };
}

function makePageNode(page: PageTreeInput, children: number): HomeGraphNode {
  return {
    id: page.id,
    title: page.title || "Untitled",
    kind: page.isFolder ? "folder" : "page",
    databaseId: "workspace",
    databaseName: "Workspace",
    group: page.isFolder ? "Folder" : "Page",
    size: page.isFolder ? 10 + Math.min(14, children * 2) : 8,
    value: children,
    properties: [],
  };
}

function addLink(
  links: HomeGraphLink[],
  seen: Set<string>,
  source: string,
  target: string,
  relation: string,
  strength: number,
): void {
  const key = `${[source, target].sort((a, b) => a.localeCompare(b)).join("--")}:${relation}`;
  if (seen.has(key)) return;
  seen.add(key);
  links.push({ id: key, source, target, relation, strength });
}

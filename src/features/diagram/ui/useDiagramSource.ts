/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useDiagramSource.ts                                   +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The source of a diagram: the SPEC compiled, from the data of the moment.
 *
 * The block never stores the rendered output (devil C110) — it compiles the
 * spec again, every time, from the data the VIEWER's client already holds.
 * That is what makes the diagram permission-filtered BY CONSTRUCTION: the
 * pages that are not in the store are not in the diagram, and a page that is
 * renamed or moved redraws itself.
 *
 * The mermaid kind goes through the locked path (`mermaidSpecToMermaid`), the
 * page-tree kind through the compiler (`compileHierarchy` + `irToMermaid`).
 * The two database kinds are drawn by the LAZY `DatabaseDiagram` module, which
 * reads the database store — this hook never does, so a mermaid diagram never
 * loads that chunk. The `graph` kind has no adapter yet: it says so instead
 * of drawing something else.
 */

import { useMemo } from "react";

import type { PageEntry } from "@/entities/page";
import { canReadPage, usePageAccessContext } from "@/shared/lib/auth/pageAccess";
import { usePageStore } from "@/store/usePageStore";

import { compileHierarchy } from "../model/compile";
import { parseDiagramSpec } from "../model/diagramSpec";
import type { DiagramSource } from "../model/diagramSource";
import { hierarchyInput, type HierarchyPage } from "../model/hierarchyInput";
import { irToMermaid, mermaidSpecToMermaid } from "../model/toMermaid";

export type { DiagramSource };

const NO_PAGES: Record<string, PageEntry[]> = {};
const NO_READABLE_PAGES: HierarchyPage[] = [];

/** The page, as the hierarchy needs it: id, title, parent, archived. */
function toHierarchyPage(page: PageEntry): HierarchyPage {
  return {
    id: page._id,
    title: page.title,
    parentId: page.parentPageId ?? null,
    archived: Boolean(page.archivedAt),
  };
}

/**
 * The source of a diagram block.
 *
 * `isPublic` closes the door on a published page: the page store is not even
 * read there, so a public page can never draw a tree of pages the visitor
 * may not read.
 */
export function useDiagramSource(
  spec: unknown,
  { isPublic }: { isPublic: boolean },
): DiagramSource {
  const pagesByWorkspace = usePageStore((state) => (isPublic ? NO_PAGES : state.pages));
  const access = usePageAccessContext();
  const parsed = useMemo(() => parseDiagramSpec(spec), [spec]);

  // The pages are read ONLY for a page tree: a hand-written mermaid diagram
  // never touches the page store.
  const wantsPages = !isPublic && parsed.ok && parsed.spec.kind === "hierarchy";
  const readable = useMemo<HierarchyPage[]>(() => {
    if (!wantsPages) return NO_READABLE_PAGES;
    const out: HierarchyPage[] = [];
    for (const list of Object.values(pagesByWorkspace)) {
      for (const page of list) {
        // A page the viewer may not read is ABSENT from the list: it never
        // appears in the diagram, not even as an unnamed node.
        if (!canReadPage(page, access)) continue;
        out.push(toHierarchyPage(page));
      }
    }
    return out;
  }, [wantsPages, pagesByWorkspace, access]);

  return useMemo<DiagramSource>(() => {
    if (!parsed.ok) {
      return { source: null, truncated: false, error: parsed.error, unsupported: false };
    }
    const diagramSpec = parsed.spec;
    if (diagramSpec.kind === "mermaid") {
      return {
        source: mermaidSpecToMermaid(diagramSpec),
        truncated: false,
        error: null,
        unsupported: false,
      };
    }
    if (diagramSpec.kind === "hierarchy") {
      const input = hierarchyInput(readable, diagramSpec.rootPageId, diagramSpec.depth);
      if (!input.root) {
        return {
          source: null,
          truncated: false,
          error: "This page tree is not available.",
          unsupported: false,
        };
      }
      const ir = compileHierarchy(input.root, input.children, diagramSpec.depth);
      return {
        source: irToMermaid(ir, { direction: diagramSpec.direction }),
        truncated: ir.truncated,
        error: null,
        unsupported: false,
      };
    }
    return { source: null, truncated: false, error: null, unsupported: true };
  }, [parsed, readable]);
}

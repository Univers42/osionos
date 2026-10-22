/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   diagramBlocks.ts                                      +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The diagram block: a page stores a SPEC, the block draws it.
 *
 * The block holds the SPEC and NOTHING ELSE (devil C110). The rendered output
 * is never stored: a diagram is compiled again, from the data the viewer can
 * already read, every time the page is opened. So a renamed page redraws, and
 * a page the reader may not read is never drawn at all.
 */

// Type-only: the feature owns the spec's type, the entity only holds the
// value. The import is erased at runtime, so there is no cycle.
import type { DiagramSpec } from "@/features/diagram/model/diagramSpec";

import type { Block } from "./types";

/**
 * The spec a fresh diagram block starts with: a two-node flowchart, small
 * enough to read at a glance and real enough to render.
 */
export const DEFAULT_DIAGRAM_SPEC: Extract<DiagramSpec, { kind: "mermaid" }> = {
  kind: "mermaid",
  source: "flowchart LR\n  A[Idea] --> B[Plan]",
};

/**
 * A fresh diagram block. `content` stays empty: the SPEC is the block, and
 * the spec is what the page stores, shares and re-reads.
 */
export function createDiagramBlock(spec: DiagramSpec = DEFAULT_DIAGRAM_SPEC): Block {
  return {
    id: crypto.randomUUID(),
    type: "diagram",
    content: "",
    diagramSpec: spec,
  };
}

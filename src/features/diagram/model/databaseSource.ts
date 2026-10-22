/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseSource.ts                                    +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The source of a DATABASE diagram: the spec, compiled from the state the
 * viewer's client holds.
 *
 * This file is PURE: it reads no store, no network and no clock. The block
 * slice hands it the databases and the pages of the client, and it hands back
 * the same shape the mermaid path returns — so the block draws both kinds
 * through ONE component.
 *
 * A pipeline whose database the client does not hold says so instead of
 * drawing an empty one: the diagram is compiled from what the viewer holds,
 * and what the viewer does not hold is not there.
 */

import { compilePipeline, compileSchema } from "./compile";
import { MAX_NODES } from "./diagramIR";
import {
  pipelineInput,
  schemaInput,
  type DatabaseLike,
  type PageLike,
} from "./databaseInput";
import type { DiagramSource } from "./diagramSource";
import { parseDiagramSpec } from "./diagramSpec";
import { irToMermaid } from "./toMermaid";

/** The source of a schema or a pipeline diagram. */
export function databaseSource(
  spec: unknown,
  databases: Record<string, DatabaseLike>,
  pages: Record<string, PageLike>,
): DiagramSource {
  const parsed = parseDiagramSpec(spec);
  if (!parsed.ok) {
    return { source: null, truncated: false, error: parsed.error, unsupported: false };
  }
  const diagramSpec = parsed.spec;
  if (diagramSpec.kind === "schema") {
    const ir = compileSchema(schemaInput(databases, diagramSpec.databaseIds));
    return {
      source: irToMermaid(ir, { direction: diagramSpec.direction }),
      truncated: ir.truncated,
      truncatedNote: ir.truncated ? `Showing the first ${MAX_NODES} nodes` : undefined,
      error: null,
      unsupported: false,
    };
  }
  if (diagramSpec.kind === "pipeline") {
    const input = pipelineInput(
      databases,
      pages,
      diagramSpec.databaseId,
      diagramSpec.statusPropertyId,
    );
    if (!input) {
      return {
        source: null,
        truncated: false,
        error: "This database is not available.",
        unsupported: false,
      };
    }
    const ir = compilePipeline(input.options, input.rows);
    return {
      source: irToMermaid(ir, { direction: diagramSpec.direction }),
      truncated: ir.truncated,
      truncatedNote: ir.truncated ? `Showing the first ${MAX_NODES} nodes` : undefined,
      error: null,
      unsupported: false,
    };
  }
  return { source: null, truncated: false, error: null, unsupported: true };
}

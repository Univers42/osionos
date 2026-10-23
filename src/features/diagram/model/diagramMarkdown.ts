/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   diagramMarkdown.ts                                    +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The markdown face of a diagram block.
 *
 * A mermaid diagram exports as a fenced ```mermaid block — the SANITIZED
 * source, the one the locked renderer would draw, so an export can never carry
 * a `%%{init:…}%%` directive or a `click` line out of the page.
 *
 * The other kinds export as the SPEC itself, in an HTML comment: a page tree
 * is drawn from data the reader may not have, so the export carries the
 * instruction, never the picture (devil C110).
 *
 * Every diagram block exports to EXACTLY ONE markdown block, like every other
 * app block: the overlay of a page file is aligned by position, so a block
 * that exported to nothing would shift the ids of the blocks after it. The
 * comment is invisible to a reader, so the placeholder is what marks the spot
 * (the draw block's "*[drawing]*" does the same).
 */

import { parseDiagramSpec } from "./diagramSpec";
import { mermaidSpecToMermaid } from "./toMermaid";

/** What a diagram leaves in the markdown where the picture cannot go. */
const DIAGRAM_PLACEHOLDER = "*[diagram]*";

/**
 * The fence that closes around a source: one backtick more than the longest
 * run of backticks inside it, so a source that carries a fence cannot break
 * out of its own.
 */
function fenceFor(source: string): string {
  const runs = source.match(/`+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * JSON that never throws and never leaves its HTML comment: a spec that cannot
 * be written is written as null, and `<`/`>` are written as \u003c/\u003e (the
 * same JSON once parsed), so a title holding `-->` cannot close the comment
 * and put its tail into the markdown as content.
 */
function safeJson(value: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(value ?? null) ?? "null";
  } catch {
    return "null";
  }
  return json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

/** The markdown of a diagram block, from its stored spec. */
export function diagramBlockToMarkdown(spec: unknown): string {
  const parsed = parseDiagramSpec(spec);
  if (!parsed.ok) {
    return `<!-- osionos:diagram ${safeJson(spec)} -->\n\n${DIAGRAM_PLACEHOLDER}`;
  }
  if (parsed.spec.kind === "mermaid") {
    const source = mermaidSpecToMermaid(parsed.spec);
    const fence = fenceFor(source);
    return `${fence}mermaid\n${source}\n${fence}`;
  }
  return `<!-- osionos:diagram ${safeJson(parsed.spec)} -->\n\n${DIAGRAM_PLACEHOLDER}`;
}

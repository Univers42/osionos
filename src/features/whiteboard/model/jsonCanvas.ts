/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   jsonCanvas.ts                                       +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * JSON Canvas 1.0 — the open format Obsidian writes and reads
 * (https://jsoncanvas.org/spec/1.0/).
 *
 * This module is pure: it parses a `.canvas` document and refuses what it cannot
 * read. Nothing here fetches, resolves a path or touches the DOM: an imported link
 * stays text, an imported file path stays a path. The mapping to and from the
 * board's own element format lives next door, in `jsonCanvasElements.ts`.
 */
import { MAX_IMPORT_ELEMENTS, MAX_TEXT_LENGTH } from "./boardLimits";
import { canvasSchema } from "./jsonCanvasSchema";

export { jsonCanvasToElements } from "./jsonCanvasElements";
export type { BoardElement, CanvasElementResult } from "./jsonCanvasElements";
export { elementsToJsonCanvas, exportJsonCanvas } from "./jsonCanvasExport";
export type { CanvasExportResult } from "./jsonCanvasExport";
export * from "./jsonCanvasLimits";

/** The side an edge leaves a node from. */
export type CanvasSide = "top" | "right" | "bottom" | "left";

/** The head of an edge: none, or an arrow. */
export type CanvasEnd = "none" | "arrow";

/** The node types the format defines. */
export type CanvasNodeType = "text" | "file" | "link" | "group";

export interface CanvasNode {
  id: string;
  /** The node's type. The format defines four; a node of another type — or of none at
   *  all — is read and then dropped and counted, never a crash. */
  type?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** A preset digit "1".."6" or a `#rrggbb` colour. */
  color?: string;
  /** A text node's markdown. */
  text?: string;
  /** A file node's path, and the heading or block inside it. */
  file?: string;
  subpath?: string;
  /** A link node's address. */
  url?: string;
  /** A group node's caption. */
  label?: string;
  /** A group node's background picture. The board format has no such thing, so it is
   *  read and dropped. */
  background?: string;
  backgroundStyle?: string;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: CanvasSide;
  toSide?: CanvasSide;
  fromEnd?: CanvasEnd;
  toEnd?: CanvasEnd;
  color?: string;
  label?: string;
}

export interface Canvas {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/** The board service does not check who is asking yet, so a board is reachable by
 *  anyone who has its link. Both the import and the export say so, in these words. */
export const JSON_CANVAS_VISIBILITY_NOTICE =
  "Anyone with the link to this board can open it: the whiteboard service does not check who is asking yet.";

export type ParseJsonCanvasResult = { ok: true; canvas: Canvas } | { ok: false; reason: string };

/** What a zod issue says, in words a reader can act on. */
function describeIssue(issue: { path: PropertyKey[]; message: string }): string {
  const where = issue.path.length > 0 ? issue.path.map(String).join(".") : "the canvas";
  return `This canvas is not readable: ${where} ${issue.message}.`;
}

/**
 * Read a `.canvas` document. A document that is not JSON, not a canvas, holds two
 * nodes under the same id or is too large for a board is refused with a reason; a
 * document that is merely odd (an unknown node type, an edge to a node that is not
 * there) reads, and the odd part is dropped and counted when it is converted.
 */
export function parseJsonCanvas(text: string): ParseJsonCanvasResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "This file is not JSON, so it is not a JSON Canvas." };
  }
  const record = raw as { nodes?: unknown; edges?: unknown } | null;
  if (!record || typeof record !== "object" || (!Array.isArray(record.nodes) && !Array.isArray(record.edges))) {
    return { ok: false, reason: "This file is not a JSON Canvas: it holds no nodes and no edges." };
  }
  const parsed = canvasSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: describeIssue(parsed.error.issues[0]) };

  const nodes = parsed.data.nodes ?? [];
  const edges = parsed.data.edges ?? [];
  if (nodes.length + edges.length > MAX_IMPORT_ELEMENTS) {
    return {
      ok: false,
      reason: `This canvas has ${nodes.length + edges.length} nodes and edges; a board holds at most ${MAX_IMPORT_ELEMENTS}.`,
    };
  }

  const seen = new Set<string>();
  for (const node of nodes) {
    if (seen.has(node.id)) return { ok: false, reason: `Two nodes share the id “${node.id}”.` };
    seen.add(node.id);
  }
  for (const edge of edges) {
    if (seen.has(edge.id)) return { ok: false, reason: `Two nodes or edges share the id “${edge.id}”.` };
    seen.add(edge.id);
  }
  for (const node of nodes) {
    const tooLong = node.text?.length ?? 0;
    if (tooLong > MAX_TEXT_LENGTH) {
      return { ok: false, reason: `The text of node “${node.id}” is ${tooLong} characters; a board holds at most ${MAX_TEXT_LENGTH}.` };
    }
    const label = node.label?.length ?? 0;
    if (label > MAX_TEXT_LENGTH) {
      return { ok: false, reason: `The label of node “${node.id}” is ${label} characters; a board holds at most ${MAX_TEXT_LENGTH}.` };
    }
  }

  return { ok: true, canvas: { nodes, edges } };
}

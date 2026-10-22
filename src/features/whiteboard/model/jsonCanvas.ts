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
import { z } from "zod";

import { MAX_IMPORT_ELEMENTS, MAX_TEXT_LENGTH } from "./boardLimits";

export { jsonCanvasToElements } from "./jsonCanvasElements";
export type { BoardElement, CanvasElementResult } from "./jsonCanvasElements";
export { elementsToJsonCanvas, exportJsonCanvas } from "./jsonCanvasExport";
export type { CanvasExportResult } from "./jsonCanvasExport";

/** A `.canvas` file over this is refused before it is read. */
export const MAX_CANVAS_FILE_BYTES = 5 * 1024 * 1024;

/** How far a node may sit from the origin, and how large it may be. A canvas that
 *  reaches further is refused rather than drawn: the numbers below are the board's
 *  own drawing range, and a node outside it would land nowhere the reader can see. */
export const MAX_CANVAS_COORDINATE = 1_000_000;
export const MAX_CANVAS_SIZE = 100_000;

/** The longest id a canvas node may carry. Longer than the board's own limit, so a
 *  canvas written by another tool still reads — the id is derived when it does not
 *  fit the contract. */
export const MAX_CANVAS_ID_LENGTH = 1_024;

/** The longest path or address a canvas node may carry. */
export const MAX_CANVAS_PATH_LENGTH = 2_048;

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

/** A colour is a preset digit or a hex triple. Anything else is not a colour. */
const colourSchema = z.string().regex(/^#[0-9a-fA-F]{6}$|^[1-6]$/);

const nodeSchema = z.object({
  id: z.string().min(1).max(MAX_CANVAS_ID_LENGTH),
  // The type is read as a word, not as an enum: a node of a type this reader does not
  // know is dropped and counted, never a refusal of the whole canvas.
  type: z.string().optional(),
  x: z.number().int().min(-MAX_CANVAS_COORDINATE).max(MAX_CANVAS_COORDINATE),
  y: z.number().int().min(-MAX_CANVAS_COORDINATE).max(MAX_CANVAS_COORDINATE),
  width: z.number().int().min(1).max(MAX_CANVAS_SIZE),
  height: z.number().int().min(1).max(MAX_CANVAS_SIZE),
  color: colourSchema.optional(),
  text: z.string().optional(),
  file: z.string().max(MAX_CANVAS_PATH_LENGTH).optional(),
  subpath: z.string().max(MAX_CANVAS_PATH_LENGTH).optional(),
  url: z.string().max(MAX_CANVAS_PATH_LENGTH).optional(),
  label: z.string().optional(),
  background: z.string().max(MAX_CANVAS_PATH_LENGTH).optional(),
  backgroundStyle: z.string().optional(),
});

const edgeSchema = z.object({
  id: z.string().min(1).max(MAX_CANVAS_ID_LENGTH),
  fromNode: z.string().min(1),
  toNode: z.string().min(1),
  fromSide: z.enum(["top", "right", "bottom", "left"]).optional(),
  toSide: z.enum(["top", "right", "bottom", "left"]).optional(),
  fromEnd: z.enum(["none", "arrow"]).optional(),
  toEnd: z.enum(["none", "arrow"]).optional(),
  color: colourSchema.optional(),
  label: z.string().optional(),
});

const canvasSchema = z.object({
  nodes: z.array(nodeSchema).optional(),
  edges: z.array(edgeSchema).optional(),
});

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

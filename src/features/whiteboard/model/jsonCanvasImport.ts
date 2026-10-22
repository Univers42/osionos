/**
 * The import of an Obsidian `.canvas` file into a board.
 *
 * The file is read by the caller (the size is checked before it is read), parsed,
 * converted, and written into a board. The scene the canvas becomes is written in the
 * board's own envelope and handed to the import the retired Draw tool already uses:
 * both refuse the same way, both keep the board a failed attempt created, and neither
 * leaves a board that holds fewer elements than were sent.
 */
import { MAX_IMPORT_ELEMENTS } from "./boardLimits";
import { jsonCanvasToElements, parseJsonCanvas } from "./jsonCanvas";
import { importLegacyDraw } from "./legacyDrawImport";
import type { WhiteboardClient } from "./whiteboardClient";

export interface JsonCanvasImportRequest {
  /** The file's content. */
  content: string;
  /** The board's title: the file's name without its extension. */
  title: string;
  /** The board a failed attempt already created: the retry writes into that one. */
  existingSlug?: string;
  client: WhiteboardClient;
}

export type JsonCanvasImportResult =
  | {
      ok: true;
      slug: string;
      title: string;
      /** The nodes the canvas held, dropped ones included. */
      nodes: number;
      /** The edges the canvas held, dropped ones included. */
      edges: number;
      droppedNodes: number;
      droppedEdges: number;
    }
  | { ok: false; message: string; slug?: string };

/** Import a canvas into a board of its own. */
export async function importJsonCanvas({
  content,
  title,
  existingSlug,
  client,
}: JsonCanvasImportRequest): Promise<JsonCanvasImportResult> {
  const parsed = parseJsonCanvas(content);
  if (!parsed.ok) return { ok: false, message: parsed.reason };

  const { elements, droppedNodes, droppedEdges } = jsonCanvasToElements(parsed.canvas);
  if (elements.length > MAX_IMPORT_ELEMENTS) {
    return {
      ok: false,
      message: `This canvas becomes ${elements.length} elements; a board holds at most ${MAX_IMPORT_ELEMENTS}.`,
    };
  }

  const written = await importLegacyDraw({
    content: JSON.stringify({ type: "osidraw", version: 1, elements }),
    title,
    existingSlug,
    client,
  });
  if (!written.ok) {
    return { ok: false, message: written.message, ...(written.slug ? { slug: written.slug } : {}) };
  }
  return {
    ok: true,
    slug: written.slug,
    title: written.title,
    nodes: parsed.canvas.nodes.length,
    edges: parsed.canvas.edges.length,
    droppedNodes,
    droppedEdges,
  };
}

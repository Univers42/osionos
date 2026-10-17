import { normalizeBoardTitle } from "./boardRefs";
import type { WhiteboardClient } from "./whiteboardClient";
import { WhiteboardApiError } from "./whiteboardClient";

/** Mirrors `MAX_ELEMENTS_PER_BOARD` in the drawnosaurus contract. Over this the service
 *  rejects the whole write, so the import is refused up front and the scene stays
 *  downloadable instead of failing after a board was created for nothing. */
export const MAX_IMPORT_ELEMENTS = 20_000;

/** The elements of a stored `.osidraw` scene. Empty content is a blank drawing; anything
 *  that is not an osidraw document is a parse failure (null), never silently empty. */
export function parseLegacyScene(content: string): unknown[] | null {
  if (content.trim() === "") return [];
  try {
    const data = JSON.parse(content) as { type?: unknown; elements?: unknown } | null;
    if (data?.type === "osidraw" && Array.isArray(data.elements)) return data.elements;
  } catch {
    /* not JSON */
  }
  return null;
}

export type LegacyImportResult =
  | { ok: true; slug: string; title: string }
  | { ok: false; message: string; slug?: string };

export interface LegacyImportRequest {
  content: string;
  title: string;
  /** Set on a retry: the board the failed attempt already created. */
  existingSlug?: string;
  client: WhiteboardClient;
}

function failure(error: unknown, slug?: string): LegacyImportResult {
  const message = error instanceof WhiteboardApiError || error instanceof Error ? error.message : "The import failed.";
  return { ok: false, message, ...(slug ? { slug } : {}) };
}

function liveCount(elements: readonly unknown[]): number {
  return elements.filter((element) => (element as { isDeleted?: boolean } | null)?.isDeleted !== true).length;
}

/** Create a board (unless `existingSlug`) and write the scene into it. Success only when
 *  the service reports the same number of live elements as were sent: a 2xx that kept
 *  fewer would otherwise let the caller replace the drawing with a truncated board.
 *  Every failure carries the slug once one exists, so Retry reuses the board. */
export async function importLegacyDraw({ content, title, existingSlug, client }: LegacyImportRequest): Promise<LegacyImportResult> {
  const elements = parseLegacyScene(content);
  if (elements === null) return { ok: false, message: "This drawing is not a readable .osidraw scene. Download it instead." };
  if (elements.length > MAX_IMPORT_ELEMENTS) {
    return { ok: false, message: `This drawing has ${elements.length} elements; a board holds at most ${MAX_IMPORT_ELEMENTS}. Download it instead.` };
  }
  const boardTitle = normalizeBoardTitle(title);
  let slug = existingSlug;
  try {
    slug ??= (await client.createBoard(boardTitle)).slug;
    const imported = await client.importScene(slug, elements);
    if (imported.elementCount !== liveCount(elements)) {
      return {
        ok: false,
        slug,
        message: `The board kept ${imported.elementCount} of ${liveCount(elements)} elements, so the drawing was not replaced.`,
      };
    }
    return { ok: true, slug, title: boardTitle };
  } catch (error) {
    return failure(error, slug);
  }
}

/** Mirrors `slugSchema` in hydrawn `packages/contract/src/board.ts`. Slugs are
 *  minted by the service; osionos only ever stores and echoes them, so every URL built
 *  from page data (markdown fences, synced blocks) passes through this first: a stored
 *  `../..` or `"><script>` never reaches an iframe `src`. */
const BOARD_SLUG = /^[a-z0-9]{6,32}$/;

export const MAX_BOARD_TITLE_LENGTH = 200;
export const UNTITLED_BOARD = "Untitled";

export function isBoardSlug(value: unknown): value is string {
  return typeof value === "string" && BOARD_SLUG.test(value);
}

/** Trim, collapse runs of whitespace, cap at the service's 200 characters; empty is "Untitled".
 *  Caveat: the cap counts UTF-16 units like the service's zod `max`, so it can cut an
 *  astral character in half; the service would count the same way and accept it. */
export function normalizeBoardTitle(raw: string): string {
  const title = raw.replaceAll(/\s+/g, " ").trim().slice(0, MAX_BOARD_TITLE_LENGTH).trim();
  return title === "" ? UNTITLED_BOARD : title;
}

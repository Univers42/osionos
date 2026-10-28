/** Mirrors `slugSchema` in hydrawn `packages/contract/src/board.ts`. Every URL built from
 *  page data (markdown fences, synced blocks) passes through this first: a stored `../..` or
 *  `"><script>` never reaches an iframe `src`. */
const BOARD_SLUG = /^[a-z0-9]{6,32}$/;

// 32 symbols, so a random byte masked to 5 bits picks one without bias.
const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const MINTED_SLUG_LENGTH = 12;

export const MAX_BOARD_TITLE_LENGTH = 200;
export const UNTITLED_BOARD = "Untitled";

export function isBoardSlug(value: unknown): value is string {
  return typeof value === "string" && BOARD_SLUG.test(value);
}

/** A new board's slug, minted here so a fresh inline block frames its board at once; hydrawn
 *  creates the board under it on the first save. 60 random bits: the bridge scopes slugs per
 *  user, so a collision would need one user to draw the same 2^60 value twice. */
export function mintBoardSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(MINTED_SLUG_LENGTH));
  return Array.from(bytes, (byte) => SLUG_ALPHABET[byte & 31]).join("");
}

/** Trim, collapse runs of whitespace, cap at the service's 200 characters; empty is "Untitled".
 *  Caveat: the cap counts UTF-16 units like the service's zod `max`, so it can cut an
 *  astral character in half; the service would count the same way and accept it. */
export function normalizeBoardTitle(raw: string): string {
  const title = raw.replaceAll(/\s+/g, " ").trim().slice(0, MAX_BOARD_TITLE_LENGTH).trim();
  return title === "" ? UNTITLED_BOARD : title;
}

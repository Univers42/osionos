import { whiteboardAppUrl } from "@/shared/config/whiteboardApp";

/** The hydrawn origin without a trailing slash, or "" when the build blanked it. */
export function whiteboardBaseUrl(): string {
  return whiteboardAppUrl().replace(/\/+$/, "");
}

/** The full board. Callers must pass a slug that already satisfied `isBoardSlug`. `title`
 *  names the board when hydrawn creates it on its first save; hydrawn trims and caps it. */
export function boardUrl(slug: string, title?: string): string {
  const query = title === undefined ? "" : `?title=${encodeURIComponent(title)}`;
  return `${whiteboardBaseUrl()}/boards/${slug}${query}`;
}

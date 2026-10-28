import { whiteboardAppUrl } from "@/shared/config/whiteboardApp";

/** The hydrawn origin without a trailing slash, or "" when the build blanked it. */
export function whiteboardBaseUrl(): string {
  return whiteboardAppUrl().replace(/\/+$/, "");
}

/** The full board. Callers must pass a slug that already satisfied `isBoardSlug`. */
export function boardUrl(slug: string): string {
  return `${whiteboardBaseUrl()}/boards/${slug}`;
}

/** Hydrawn's page that creates an empty board titled `title` and reports its slug to the
 *  framing page; hydrawn itself trims and caps the title. */
export function newBoardUrl(title: string): string {
  return `${whiteboardBaseUrl()}/new?title=${encodeURIComponent(title)}`;
}

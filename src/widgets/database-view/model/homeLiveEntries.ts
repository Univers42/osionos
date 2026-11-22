/**
 * Pure selection of the pages behind the Home "Recently visited" and
 * "Featured templates" carousels. Kept free of store imports so the rules
 * (dedupe by id, hide the Home page itself, never hand a non-image cover to the
 * gallery) are testable and shared by both read-only adapters and the empty state.
 * The adapters also sign the cards' upload covers here (osionos#233).
 */

import type { NotionState } from "@notion-db/object-database";
import type { ActivePage, PageEntry } from "@/entities/page";
import type { MediaSigner } from "@/shared/lib/media/mediaSigner";
import { appMediaSigner } from "@/shared/lib/media/appMediaSigner";
import { signedMediaUrl } from "@/shared/lib/media/useSignedMediaUrl";

/** Gallery cards render `cover` as a CSS gradient or an <img src>; anything else
 *  (a bare token, an emoji) is a broken image, so it is dropped to the placeholder.
 *  Caveat: prefix match only — a malformed http(s) URL still renders broken. */
export function safeCardCover(cover: string | null | undefined): string | undefined {
  if (!cover) return undefined;
  return /^(https?:|\/|data:image\/|blob:|linear-gradient|radial-gradient)/.test(cover) ? cover : undefined;
}

/** First occurrence of each `_id` wins; later duplicates are dropped. */
export function dedupeById<T extends { _id: string }>(entries: readonly T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => !seen.has(entry._id) && seen.add(entry._id));
}

/** The workspace's recently-visited pages, freshest first. The Home dashboard
 *  itself is excluded: the user is looking at it. */
export function pickRecentEntries(
  recents: readonly ActivePage[],
  workspaceId: string,
  pageById: (id: string) => PageEntry | undefined,
): PageEntry[] {
  const out: PageEntry[] = [];
  for (const recent of recents) {
    if (recent.kind !== "page" || recent.workspaceId !== workspaceId) continue;
    const entry = pageById(recent.id);
    if (!entry || entry.archivedAt || entry.surface === "home") continue;
    out.push(entry);
  }
  return dedupeById(out);
}

/**
 * The gallery draws `cover` as it is, so each card's upload cover is signed here, with the card's
 * page as the authority; any other cover is kept as it is.
 * Caveat: a cover is signed when the gallery loads its state. A gallery left open past the link's
 * lifetime (1-2 h) with no page or recents change shows a broken cover until the next reload.
 */
export async function signCardCovers(state: NotionState, signer: MediaSigner = appMediaSigner): Promise<NotionState> {
  const pages = await Promise.all(Object.entries(state.pages).map(async ([id, page]) =>
    [id, page.cover ? { ...page, cover: await signedMediaUrl(page.cover, page.id, signer) } : page] as const));
  return { ...state, pages: Object.fromEntries(pages) };
}

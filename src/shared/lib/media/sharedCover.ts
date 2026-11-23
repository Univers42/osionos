// The profile cover as the app draws it (groot ADR 0064 PS35/PS36): the README page's cover
// when the shared rule accepts it, else the legacy banner, and nothing unless one passes.

import { isSafeSharedCover } from "../../../../scripts/bridge-cover-rules.mjs";
import { normalizeMediaSource } from "../../ui/assets/collectionMedia";
import { isSafeImageSource } from "./bridgeMediaUrl";

export function sharedCover(cover: string | null | undefined): string | null {
  return isSafeSharedCover(cover, isSafeImageSource) ? (cover as string) : null;
}

/** No write migration: a page without a usable cover keeps showing the banner it had. */
export function profileCover(pageCover: string | null | undefined, bannerUrl: string | null | undefined): string | null {
  return sharedCover(normalizeMediaSource(pageCover ?? undefined)) ?? sharedCover(bannerUrl);
}

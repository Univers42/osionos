// The profile cover as the app draws it (groot ADR 0064 PS35/PS36): the README page's cover,
// else the legacy banner, and nothing at all unless it passes the rule the bridge shares.

import { isSafeSharedCover } from "../../../../scripts/bridge-cover-rules.mjs";
import { isSafeImageSource } from "./bridgeMediaUrl";

export function sharedCover(cover: string | null | undefined): string | null {
  return isSafeSharedCover(cover, isSafeImageSource) ? (cover as string) : null;
}

/** No write migration: a page without a cover keeps showing the banner it had. */
export function profileCover(pageCover: string | null | undefined, bannerUrl: string | null | undefined): string | null {
  return sharedCover(pageCover ?? bannerUrl);
}

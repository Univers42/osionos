// The banner as the README page cover while osio.profile.page is not live (groot ADR 0064
// PS36): /api/profile/banner stays the source of bannerUrl, and the cover follows it so a
// profile shown as a page carries the same picture. Nothing here creates a README.

import type { LinkedPage } from "./readmeCustomize";

export interface BannerCoverIo {
  readmePageId: string | null;
  openReadme: (pageId: string) => Promise<LinkedPage>;
  setCover: (pageId: string, cover: string | null) => void;
}

/** `banner` null is a removal; `previous` is the banner the owner saw before the change. */
export interface BannerChange {
  banner: string | null;
  previous: string | null;
}

export type MirrorOutcome = "mirrored" | "skipped" | "failed";

/** A removal leaves a cover the owner picked on the page itself; only the mirrored banner goes. */
export async function mirrorBannerToCover(io: BannerCoverIo, change: BannerChange): Promise<MirrorOutcome> {
  if (!io.readmePageId) return "skipped";
  const linked = await io.openReadme(io.readmePageId);
  if (linked.status === "error") return "failed";
  if (linked.status === "gone") return "skipped";
  if (change.banner === null && (linked.page.cover ?? null) !== change.previous) return "skipped";
  io.setCover(io.readmePageId, change.banner);
  return "mirrored";
}

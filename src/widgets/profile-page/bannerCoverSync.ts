// Wires bannerCoverMirror to the stores. BannerUpload imports this dynamically and only when
// osio.profile.page is on, so the settings chunk and the boot graph do not grow (ADR 0067 PH7).

import { getActivePageJwt } from "@/shared/api/client";
import { useAccountProfileStore } from "@/store/settings/useAccountProfileStore";
import { usePageStore } from "@/store/usePageStore";
import { mirrorBannerToCover, type BannerChange, type MirrorOutcome } from "./model/bannerCoverMirror";
import { openLinked } from "./useReadmeCustomize";

export function mirrorBanner(change: BannerChange): Promise<MirrorOutcome> {
  const jwt = getActivePageJwt() ?? "";
  return mirrorBannerToCover({
    readmePageId: useAccountProfileStore.getState().profile?.readmePageId ?? null,
    openReadme: (pageId) => openLinked(pageId, jwt),
    setCover: (pageId, cover) => usePageStore.getState().editPageHeader(pageId, { cover: cover ?? undefined }),
  }, change);
}

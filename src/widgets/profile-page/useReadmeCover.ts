// The owner's README page cover, for the profile drawn as a page (groot ADR 0064 PS36): the
// store's copy when the page is loaded, so a cover changed in the README tab shows at once,
// else one read of the owner's own page. A visitor gets nothing: the card carries no cover
// (adding one is a bridge change, stopped), so a visitor sees the banner as before.

import { useEffect, useState } from "react";

import type { PageEntry } from "@/entities/page";
import { api, getActivePageJwt } from "@/shared/api/client";
import { usePageStore } from "@/store/usePageStore";

export function useReadmeCover(pageId: string | null, isOwner: boolean): string | undefined {
  const ownPageId = isOwner ? pageId : null;
  const stored = usePageStore((state) => (ownPageId ? state.pageById(ownPageId) : undefined));
  const [fetched, setFetched] = useState<PageEntry | null>(null);

  useEffect(() => {
    const jwt = getActivePageJwt();
    if (!ownPageId || stored || !jwt) return undefined;
    let alive = true;
    api.get<PageEntry>(`/api/pages/${encodeURIComponent(ownPageId)}`, jwt)
      .then((page) => { if (alive) setFetched(page); })
      // A failed read leaves the banner showing (profileCover falls back to it); useProfile already
      // reports an unreadable profile, so a second message would say the same thing.
      .catch(() => undefined);
    return () => { alive = false; };
  }, [ownPageId, stored]);

  const page = stored ?? (fetched?._id === ownPageId ? fetched : null);
  return page?.cover;
}

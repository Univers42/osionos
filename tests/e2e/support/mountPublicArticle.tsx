// Browser-side helper: draws the published-page article the way /p/:token does, from blocks the
// spec builds in the page (so one of them can throw while rendering, which JSON cannot carry).
import React from "react";
import { createRoot } from "react-dom/client";

import { PublicArticle } from "@/pages/public/PublicPageView";

export function mountPublicArticle(blocks: never[], containers: boolean): void {
  const host = document.createElement("div");
  host.id = "public-host";
  document.body.appendChild(host);
  createRoot(host).render(
    <div data-testid="in-public">
      <PublicArticle page={{ title: "Published", icon: null, content: blocks, publishedAt: "" }} containers={containers} />
    </div>,
  );
}

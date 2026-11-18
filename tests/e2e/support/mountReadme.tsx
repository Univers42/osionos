// Browser-side helper for specs: draws the profile README and, beside it, the same blocks as an
// ordinary page, so a spec can compare computed styles of the two. Loaded through the Vite dev
// server (page.evaluateHandle(() => import("/tests/e2e/support/mountReadme.tsx"))) because a bare
// `react` import only resolves inside Vite's module graph.
import React from "react";
import { createRoot } from "react-dom/client";

import { PageBlocksRenderer } from "@/widgets/page-renderer/ui/PageBlocksRenderer";
import { ReadmeBlocks } from "@/widgets/profile-page/ReadmeBlocks";

export function mountReadme(blocks: never[]): void {
  const host = document.createElement("div");
  host.id = "readme-host";
  document.body.appendChild(host);
  createRoot(host).render(
    <div>
      <div data-testid="in-readme"><ReadmeBlocks readme={{ pageId: "p", blocks }} record={null} /></div>
      <div data-testid="in-page"><PageBlocksRenderer blocks={blocks} /></div>
    </div>,
  );
}

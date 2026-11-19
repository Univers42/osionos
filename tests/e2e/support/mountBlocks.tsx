// Browser-side helper for specs: draws blocks read-only (PageBlocksRenderer) in a fixed, opaque
// 720 px frame over the app, so a screenshot of it holds only those blocks. Loaded through the
// Vite dev server (page.evaluateHandle(() => import("/tests/e2e/support/mountBlocks.tsx"))).
import React from "react";
import { createRoot } from "react-dom/client";

import { PageBlocksRenderer } from "@/widgets/page-renderer/ui/PageBlocksRenderer";

export function mountBlocks(blocks: never[]): void {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;z-index:2147483000;overflow:auto;padding:24px;background:var(--osio-bg-page)";
  document.body.appendChild(host);
  createRoot(host).render(
    <div data-testid="mounted-blocks" style={{ width: 720 }}>
      <PageBlocksRenderer blocks={blocks} />
    </div>,
  );
}

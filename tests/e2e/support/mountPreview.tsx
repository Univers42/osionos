// Browser-side helper: a read-only markdown code block in preview, at a fixed content width.
// Loaded through the Vite dev server like mountReadme.tsx.
import React from "react";
import { createRoot } from "react-dom/client";

import { CodeBlockReadOnly } from "@/entities/block/ui/CodeBlockReadOnly";

export function mountPreview(content: string, width: number): void {
  const host = document.createElement("div");
  host.id = "preview-host";
  host.style.cssText = `width:${width}px;margin:0 auto;padding:16px;background:var(--osio-bg-page)`;
  document.body.appendChild(host);
  const block = { id: "md", type: "code", language: "markdown", codeView: "preview", content } as never;
  createRoot(host).render(<CodeBlockReadOnly block={block} />);
}

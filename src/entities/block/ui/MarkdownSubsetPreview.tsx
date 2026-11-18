import React from "react";
import { parse } from "@osionos/markdown-engine";
import { renderReact } from "@osionos/markdown-engine/react";

// The only place the engine's README HTML subset is switched on (ADR 0058 U4-3, enforced by
// scripts/check-readme-subset-call-site.sh). The engine builds React elements from a parsed
// tree, so markup in the source is never injected as HTML.
// Caveat: the subset is a fixed allowlist of tags; anything else in the source is shown as text,
// so a README using other HTML looks different here than on GitHub.

const MEDIA_PREFIXES = ["/api/media/uploads/"];

// Preflight makes img a block, which would stack a row of badges.
const PREVIEW_CLASS =
  "osio-markdown-preview overflow-x-auto p-4 text-sm leading-6 text-[var(--osio-code-fg)] [&_img]:inline [&_img]:max-w-full [&_img]:align-middle [&_table]:border-collapse [&_td]:px-2 [&_th]:px-2";

export const MarkdownSubsetPreview: React.FC<{ content: string }> = ({ content }) => {
  const elements = React.useMemo(
    () => renderReact(parse(content, { htmlSubset: true }), { htmlSubset: { mediaPrefixes: MEDIA_PREFIXES } }),
    [content],
  );
  return <div className={PREVIEW_CLASS} data-testid="markdown-preview">{elements}</div>;
};

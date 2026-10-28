import React from "react";

import type { Block } from "@/entities/block";

import { downloadLegacyScene } from "../model/downloadLegacyScene";

const BUTTON =
  "rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2.5 py-1 text-xs text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)]";

/** What a `draw` block shows now that the native Draw tool is gone. The scene stays in
 *  `block.content` untouched, and can be downloaded as-is. */
export const LegacyDrawNotice: React.FC<{ block: Block }> = ({ block }) => (
  <div
    role="group"
    aria-label="Retired drawing"
    className="flex flex-col gap-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2.5"
  >
    <p className="text-sm text-[var(--osio-fg-default)]">This drawing was made with the retired Draw tool.</p>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={BUTTON} onClick={() => downloadLegacyScene(block.id, block.content ?? "")}>
        Download .osidraw
      </button>
    </div>
  </div>
);

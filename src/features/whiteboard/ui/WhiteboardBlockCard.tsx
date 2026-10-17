import React, { useState } from "react";
import { ExternalLink } from "lucide-react";

import type { Block } from "@/entities/block";

import { isBoardSlug, normalizeBoardTitle } from "../model/boardRefs";
import { boardUrl, thumbnailUrl } from "../model/whiteboardClient";

/** The read-only face of a whiteboard block: a static card, never an iframe. A shared or
 *  exported page must not embed a live editing surface, and a board the reader cannot open
 *  still shows its title. A 404 thumbnail (no picture yet) falls back to a placeholder. */
export const WhiteboardBlockCard: React.FC<{ block: Block }> = ({ block }) => {
  const [hasThumbnail, setHasThumbnail] = useState(true);
  const title = normalizeBoardTitle(block.content ?? "");
  const slug = block.boardSlug;
  const isValidSlug = isBoardSlug(slug);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-3">
      <div className="flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]">
        {isValidSlug && hasThumbnail ? (
          <img
            src={thumbnailUrl(slug)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setHasThumbnail(false)}
          />
        ) : (
          <span data-testid="whiteboard-thumbnail-placeholder" className="text-xs text-[var(--osio-fg-subtle)]">
            No preview
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-semibold text-[var(--osio-fg-default)]">{title}</span>
        <span className="text-xs text-[var(--osio-fg-subtle)]">Whiteboard</span>
      </div>
      {isValidSlug ? (
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2.5 py-1 text-xs text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]"
          onClick={() => globalThis.open(boardUrl(slug), "_blank", "noopener,noreferrer")}
        >
          Open <ExternalLink size={12} />
        </button>
      ) : null}
    </div>
  );
};

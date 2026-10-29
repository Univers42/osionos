import React from "react";
import { Maximize2 } from "lucide-react";

import type { Block } from "@/entities/block";
import { whiteboardBoardTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";

import { isBoardSlug, normalizeBoardTitle } from "../model/boardRefs";

const ACTION =
  "inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2.5 py-1 text-xs text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]";

/** The read-only face of a whiteboard block: a static card, never an iframe. A shared or
 *  exported page must not embed a live editing surface. Boards are owner-isolated, so
 *  "Open" shows the board only to its owner; anyone else still sees its title here. */
export const WhiteboardBlockCard: React.FC<{ block: Block }> = ({ block }) => {
  const title = normalizeBoardTitle(block.content ?? "");
  const slug = block.boardSlug;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-semibold text-[var(--osio-fg-default)]">{title}</span>
        <span className="text-xs text-[var(--osio-fg-subtle)]">Whiteboard</span>
      </div>
      {isBoardSlug(slug) ? (
        <button
          type="button"
          className={ACTION}
          onClick={() => useWorkspaceLayout.getState().openTab(whiteboardBoardTab(slug, title))}
        >
          Open <Maximize2 size={12} aria-hidden />
        </button>
      ) : null}
    </div>
  );
};

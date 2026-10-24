import React, { useCallback, useRef, useState } from "react";
import { ExternalLink, MoreHorizontal } from "lucide-react";
import { useClickOutside, useEscapeKey } from "@osionos/ui/hooks";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";

import type { Block } from "@/entities/block";

import { isBoardSlug, normalizeBoardTitle } from "../model/boardRefs";
import { downloadJsonFile } from "../model/downloadLegacyScene";
import { JSON_CANVAS_VISIBILITY_NOTICE } from "../model/jsonCanvas";
import { canvasFileName, exportJsonCanvas } from "../model/jsonCanvasExport";
import { boardUrl, thumbnailUrl, whiteboardClient } from "../model/whiteboardClient";

const ACTION =
  "inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2.5 py-1 text-xs text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]";

/** The board card's menu: what a reader can do with a board. The export writes the
 *  board as a JSON Canvas, the format Obsidian reads, and the menu says who can open
 *  the board — the service does not check who is asking yet. */
export const WhiteboardBoardMenu: React.FC<{ onExport: () => void }> = ({ onExport }) => (
  <div className="absolute right-0 top-full z-[var(--osio-z-popover)] mt-1 w-[17rem] osio-surface-overlay">
    <div role="menu" aria-label="Board actions">
      <button type="button" role="menuitem" className="osio-menu-item" onClick={onExport}>
        Export as JSON Canvas
      </button>
    </div>
    <p className="border-t border-[var(--osio-border-default)] px-3 py-2 text-2xs text-[var(--osio-fg-subtle)]">
      {JSON_CANVAS_VISIBILITY_NOTICE}
    </p>
  </div>
);

/** The read-only face of a whiteboard block: a static card, never an iframe. A shared or
 *  exported page must not embed a live editing surface, and a board the reader cannot open
 *  still shows its title. A 404 thumbnail (no picture yet) falls back to a placeholder.
 *  The card's menu exports the board as a JSON Canvas. */
export const WhiteboardBlockCard: React.FC<{ block: Block }> = ({ block }) => {
  const [hasThumbnail, setHasThumbnail] = useState(true);
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const title = normalizeBoardTitle(block.content ?? "");
  const slug = block.boardSlug;
  const isValidSlug = isBoardSlug(slug);

  useClickOutside(menuRef, () => setMenuOpen(false), isMenuOpen);
  useEscapeKey(() => setMenuOpen(false), isMenuOpen);

  const exportCanvas = useCallback(async () => {
    if (!isValidSlug) return;
    setError(null);
    try {
      const elements = await whiteboardClient.readScene(slug);
      const { canvas, skipped } = exportJsonCanvas(elements);
      downloadJsonFile(canvasFileName(title), JSON.stringify(canvas, null, 2));
      useToastStore.getState().push({
        kind: "success",
        title: "Canvas exported",
        description: `${canvas.nodes.length} nodes and ${canvas.edges.length} edges were written${
          skipped > 0 ? `; ${skipped} elements could not be carried over` : ""
        }.`,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The board could not be read.");
    }
  }, [isValidSlug, slug, title]);

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
        {error ? (
          <span role="alert" className="text-xs text-[var(--osio-danger-fg)]">
            {error}
          </span>
        ) : null}
      </div>
      {isValidSlug ? (
        <>
          <button
            type="button"
            className={ACTION}
            onClick={() => globalThis.open(boardUrl(slug), "_blank", "noopener,noreferrer")}
          >
            Open <ExternalLink size={12} />
          </button>
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              className={ACTION}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              aria-label="Board actions"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={12} aria-hidden />
            </button>
            {isMenuOpen ? (
              <WhiteboardBoardMenu
                onExport={() => {
                  setMenuOpen(false);
                  void exportCanvas();
                }}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
};

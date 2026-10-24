import React, { useCallback, useRef, useState } from "react";

import { WHITEBOARD_BLOCK_DEFAULT_HEIGHT, type Block } from "@/entities/block";

import { downloadLegacyScene } from "../model/downloadLegacyScene";
import { importLegacyDraw } from "../model/legacyDrawImport";
import { isWhiteboardReady } from "../model/whiteboardAvailability";
import { whiteboardClient } from "../model/whiteboardClient";

interface Props {
  block: Block;
  /** Present only when the page is editable; its absence hides "Import as whiteboard". */
  onConvert?: (updates: Partial<Block>) => void;
}

const BUTTON =
  "rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2.5 py-1 text-xs text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)] disabled:opacity-50";

/** What a `draw` block shows now that the native Draw tool is gone. The scene stays in
 *  `block.content` untouched: it is either downloaded as-is or copied into a new board,
 *  and the block only changes type after the service confirmed every element arrived. */
export const LegacyDrawNotice: React.FC<Props> = ({ block, onConvert }) => {
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // A failed attempt may already have created its board; Retry writes into the same one.
  const createdSlug = useRef<string | undefined>(undefined);

  const importAsWhiteboard = useCallback(async () => {
    if (!onConvert) return;
    setIsImporting(true);
    setErrorMessage(null);
    const result = await importLegacyDraw({
      content: block.content ?? "",
      title: "Imported drawing",
      existingSlug: createdSlug.current,
      client: whiteboardClient,
    });
    setIsImporting(false);
    if (!result.ok) {
      createdSlug.current = result.slug ?? createdSlug.current;
      setErrorMessage(result.message);
      return;
    }
    onConvert({
      type: "whiteboard",
      boardSlug: result.slug,
      whiteboardHeight: block.drawHeight ?? WHITEBOARD_BLOCK_DEFAULT_HEIGHT,
      content: result.title,
      drawHeight: undefined,
    });
  }, [block.content, block.drawHeight, onConvert]);

  return (
    <div
      role="group"
      aria-label="Retired drawing"
      className="flex flex-col gap-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2.5"
    >
      <p className="text-sm text-[var(--osio-fg-default)]">This drawing was made with the retired Draw tool.</p>
      <div className="flex flex-wrap items-center gap-2">
        {onConvert && isWhiteboardReady() ? (
          <button type="button" className={BUTTON} disabled={isImporting} onClick={() => void importAsWhiteboard()}>
            {isImporting ? "Importing…" : errorMessage ? "Retry import" : "Import as whiteboard"}
          </button>
        ) : null}
        <button type="button" className={BUTTON} onClick={() => downloadLegacyScene(block.id, block.content ?? "")}>
          Download .osidraw
        </button>
      </div>
      {errorMessage ? (
        <p role="alert" className="text-xs text-[var(--osio-danger-fg)]">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
};

/**
 * The import of an Obsidian `.canvas` file, next to the action that creates a board.
 *
 * The file is read here, so its size is checked before it is: a file over 5 MB is
 * refused without ever being read. What comes in is parsed, converted and written
 * into a board of its own; the toast says how many nodes and edges came in and how
 * many were dropped, and the board the import made is handed back to the caller.
 */
import React, { useCallback, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";

import { JSON_CANVAS_VISIBILITY_NOTICE, MAX_CANVAS_FILE_BYTES } from "../model/jsonCanvas";
import { importJsonCanvas } from "../model/jsonCanvasImport";
import { whiteboardClient, type WhiteboardClient } from "../model/whiteboardClient";

interface Props {
  /** The board the import made: the caller binds to it. */
  onImported: (board: { slug: string; title: string }) => void;
  client?: WhiteboardClient;
}

const BUTTON =
  "inline-flex items-center gap-1 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2.5 py-1 text-xs text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)] disabled:opacity-50";

/** The file name without its extension: the board's title. */
function titleOf(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

export const JsonCanvasImport: React.FC<Props> = ({ onImported, client = whiteboardClient }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A failed attempt may already have created its board; the next attempt writes into
  // that one instead of creating a second.
  const createdSlug = useRef<string | undefined>(undefined);

  const onPick = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Cleared so the same file can be picked again after a failure.
      event.target.value = "";
      if (!file) return;
      if (file.size > MAX_CANVAS_FILE_BYTES) {
        setError(`This file is ${Math.ceil(file.size / (1024 * 1024))} MB; the import reads at most 5 MB.`);
        return;
      }
      setIsImporting(true);
      setError(null);
      const result = await importJsonCanvas({
        content: await file.text(),
        title: titleOf(file.name),
        existingSlug: createdSlug.current,
        client,
      });
      setIsImporting(false);
      if (!result.ok) {
        createdSlug.current = result.slug ?? createdSlug.current;
        setError(result.message);
        return;
      }
      createdSlug.current = undefined;
      const dropped = result.droppedNodes + result.droppedEdges;
      useToastStore.getState().push({
        kind: "success",
        title: "Canvas imported",
        description: `${result.nodes} nodes and ${result.edges} edges came in; ${dropped} were dropped.`,
      });
      onImported({ slug: result.slug, title: result.title });
    },
    [client, onImported],
  );

  return (
    <span className="flex flex-col items-center gap-1">
      <span className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".canvas, application/json"
          className="hidden"
          aria-label="JSON Canvas file to import"
          onChange={(event) => void onPick(event)}
        />
        <button type="button" className={BUTTON} disabled={isImporting} onClick={() => inputRef.current?.click()}>
          <FileUp size={12} aria-hidden />
          {isImporting ? "Importing…" : "Import JSON Canvas (.canvas)"}
        </button>
      </span>
      <span className="max-w-[22rem] text-center text-2xs text-[var(--osio-fg-subtle)]">{JSON_CANVAS_VISIBILITY_NOTICE}</span>
      {error ? (
        <span role="alert" className="max-w-[22rem] text-center text-xs text-[var(--osio-danger-fg)]">
          {error}
        </span>
      ) : null}
    </span>
  );
};

import React, { useCallback, useRef } from "react";
import { ExternalLink, Maximize2 } from "lucide-react";

import { WHITEBOARD_BLOCK_DEFAULT_HEIGHT, WHITEBOARD_MIN_HEIGHT, type Block } from "@/entities/block";
import { useHasBeenNearViewport } from "@/shared/lib/dom/useHasBeenNearViewport";
import { useHeightResizeGrip } from "@/shared/lib/dom/useHeightResizeGrip";
import { embeddableUrl } from "@/widgets/embed-app/model/embeddableUrl";
import { EmbedFrame } from "@/widgets/embed-app/ui/EmbedFrame";
import { whiteboardBoardTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";

import { isBoardSlug, normalizeBoardTitle } from "../model/boardRefs";
import { startBoardCreation, usePendingBoards } from "../model/pendingBoards";
import { boardUrl } from "../model/whiteboardClient";
import { JsonCanvasImport } from "./JsonCanvasImport";

interface Props {
  block: Block;
  onUpdateBlock: (updates: Partial<Block>) => void;
}

const HEADER_BUTTON =
  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]";
const ACTION_BUTTON =
  "rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2.5 py-1 text-xs text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)]";

// grip -> block root -> the height-owning wrapper in BlockEditor
const resolveHeightOwner = (grip: HTMLElement): HTMLElement | null => grip.parentElement?.parentElement ?? null;

/** The inline whiteboard: header, the board in a sandboxed iframe, and a bottom-edge
 *  resize grip. The sized element is the PARENT div (BlockEditor owns the height style), so
 *  a drag writes that element's style directly and commits `whiteboardHeight` ONCE on release;
 *  committing per move would run the page-save pipeline at pointer rate. */
export const WhiteboardBlock: React.FC<Props> = ({ block, onUpdateBlock }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const isNear = useHasBeenNearViewport(rootRef);
  const pending = usePendingBoards((state) => state.byBlockId[block.id]);
  const title = normalizeBoardTitle(block.content ?? "");
  const slug = block.boardSlug;
  const hasSlug = slug !== undefined && slug !== "";
  const isValidSlug = isBoardSlug(slug);
  const frameUrl = isValidSlug ? embeddableUrl(boardUrl(slug)) : "";
  const height = block.whiteboardHeight ?? WHITEBOARD_BLOCK_DEFAULT_HEIGHT;

  const createBoard = useCallback(() => {
    void startBoardCreation(block.id, title, (boardSlug) => onUpdateBlock({ boardSlug }));
  }, [block.id, title, onUpdateBlock]);

  /** An imported canvas is a board of its own: the block binds to it and takes its
   *  title. Offered only while the block has no board, so an import never replaces a
   *  drawing someone already made. */
  const onImported = useCallback(
    (board: { slug: string; title: string }) => {
      onUpdateBlock({ boardSlug: board.slug, content: board.title });
    },
    [onUpdateBlock],
  );

  const { isDragging, gripProps } = useHeightResizeGrip({
    height,
    min: WHITEBOARD_MIN_HEIGHT,
    resolveTarget: resolveHeightOwner,
    onCommit: (whiteboardHeight) => onUpdateBlock({ whiteboardHeight }),
  });

  let body: React.ReactNode;
  if (hasSlug && !isValidSlug) {
    body = <Message>This whiteboard link is not valid, so the board was not loaded.</Message>;
  } else if (hasSlug && frameUrl === "") {
    body = <Message>The whiteboard service is not configured for this build.</Message>;
  } else if (hasSlug) {
    body = isNear ? <EmbedFrame url={frameUrl} title={title} interactive={!isDragging} loading="lazy" /> : null;
  } else if (pending?.status === "creating") {
    body = <Message>Creating board “{title}”…</Message>;
  } else if (pending?.status === "error") {
    body = (
      <Message>
        <span role="alert">{pending.message}</span>
        <button type="button" className={ACTION_BUTTON} onClick={createBoard}>
          Retry
        </button>
      </Message>
    );
  } else {
    body = (
      <Message>
        <span>This whiteboard has no board yet.</span>
        <span className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" className={ACTION_BUTTON} onClick={createBoard}>
            Create board
          </button>
          <JsonCanvasImport onImported={onImported} />
        </span>
      </Message>
    );
  }

  return (
    <div ref={rootRef} className="group/whiteboard relative flex h-full w-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-1.5">
        <span className="min-w-0 truncate text-xs font-semibold text-[var(--osio-fg-default)]">{title}</span>
        {isValidSlug ? (
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className={HEADER_BUTTON}
              onClick={() => useWorkspaceLayout.getState().openTab(whiteboardBoardTab(slug, title))}
            >
              Open full <Maximize2 size={12} />
            </button>
            <button
              type="button"
              className={HEADER_BUTTON}
              onClick={() => globalThis.open(boardUrl(slug), "_blank", "noopener,noreferrer")}
            >
              Open externally <ExternalLink size={12} />
            </button>
          </span>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{body}</div>
      <div
        role="separator"
        aria-label="Resize whiteboard"
        {...gripProps}
        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0 transition-opacity group-hover/whiteboard:opacity-100"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-[var(--osio-border-strong)]" />
      </div>
    </div>
  );
};

const Message: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-[var(--osio-fg-subtle)]">
    {children}
  </div>
);

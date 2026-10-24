import type { Block } from "./types";

export const WHITEBOARD_BLOCK_DEFAULT_HEIGHT = 520;
export const WHITEBOARD_MIN_HEIGHT = 240;

/** A fresh inline whiteboard block. `content` carries the board title so a raw-mode or
 *  exported page stays readable; `boardSlug` is absent until the board exists on the
 *  whiteboard service, which is what lets the UI offer Create/Retry instead of
 *  rendering an iframe that cannot load. */
export function createWhiteboardBlock({ title, boardSlug }: { title: string; boardSlug?: string }): Block {
  return {
    id: crypto.randomUUID(),
    type: "whiteboard",
    content: title,
    whiteboardHeight: WHITEBOARD_BLOCK_DEFAULT_HEIGHT,
    ...(boardSlug ? { boardSlug } : {}),
  };
}

import { BoardStoreError, boardCss, createHostedStore, mountBoard, type BoardHandle, type BoardTheme } from "@hydrawn/board";

import { API_BASE } from "@/shared/api/client";

import { createBridgeBoardApi } from "./bridgeBoardApi";
import { whiteboardToken } from "./whiteboardToken";

/**
 * The board drawn in this page: hydrawn's library (`vendor/hydrawn-board`), mounted into an
 * open shadow root and saving through the bridge with the whiteboard token. Reached only by a
 * dynamic import from `InProcessBoard`, so none of it is in the entry chunk.
 */

let sheet: CSSStyleSheet | null = null;

/** One parsed copy of the board's stylesheet, adopted by every board's shadow root. */
function boardSheet(): CSSStyleSheet {
  if (sheet === null) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(boardCss);
  }
  return sheet;
}

const bridge = createBridgeBoardApi({
  baseUrl: API_BASE,
  token: async () => (await whiteboardToken())?.token ?? null,
  refusal: (status, code, message) => new BoardStoreError(status, code, message),
});

export interface InProcessBoardOptions {
  slug: string;
  /** The block's title, read when the first save creates the board. */
  title: () => string;
  theme: BoardTheme;
}

export async function mountInProcessBoard(shadow: ShadowRoot, { slug, title, theme }: InProcessBoardOptions): Promise<BoardHandle> {
  shadow.adoptedStyleSheets = [boardSheet()];
  // Created before it is read: the bridge's create under a given slug is idempotent (200 for
  // one it has), and reading a board the first save has not created yet answers 404, which
  // the browser reports in the console. Caveat: opening a page shows the viewer's own board
  // under that slug, so a block on someone else's page gives the viewer an empty one, counted
  // against their 200. A failed create is left to the board, which reports what it cannot read.
  await bridge.createBoard(title(), slug).catch(() => undefined);
  const store = createHostedStore(bridge, title);
  return mountBoard(shadow, { store, slug, title: title(), theme });
}

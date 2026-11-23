import { BoardStoreError, boardCss, createHostedStore, mountBoard, type BoardHandle, type BoardTheme } from "@hydrawn/board";

import { API_BASE } from "@/shared/api/client";

import { createBoardLookup, createBridgeBoardApi, type BridgeBoardApiDeps } from "./bridgeBoardApi";
import { readNewBoardsLocally } from "./newBoardRead";
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

const deps: BridgeBoardApiDeps = {
  baseUrl: API_BASE,
  token: async () => (await whiteboardToken())?.token ?? null,
  refusal: (status, code, message) => new BoardStoreError(status, code, message),
};

const bridge = readNewBoardsLocally(createBridgeBoardApi(deps), { hasBoard: createBoardLookup(deps), refusal: deps.refusal });

export interface InProcessBoardOptions {
  slug: string;
  /** The block's title, read when the first save creates the board. */
  title: () => string;
  theme: BoardTheme;
}

export async function mountInProcessBoard(shadow: ShadowRoot, { slug, title, theme }: InProcessBoardOptions): Promise<BoardHandle> {
  shadow.adoptedStyleSheets = [boardSheet()];
  const store = createHostedStore(bridge, title);
  return mountBoard(shadow, { store, slug, title: title(), theme });
}

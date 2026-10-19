import { UNTITLED_BOARD } from "./boardRefs";
import type { BoardCreator } from "./pendingBoards";

export interface NewBoardTarget {
  openBoard: (slug: string, title: string) => void;
  reportError: (message: string) => void;
}

// One creation at a time: a board cannot be deleted from osionos, so a double click
// must not leave an orphan behind.
let creating = false;

/** Create an Untitled board and open it in its own tab, or report why it failed.
 *  Caveat: no deadline. `createBoard` has no timeout, so a service that accepts the
 *  connection and never answers leaves this pending with no toast and blocks the next
 *  click; bounding the whiteboard API calls is a separate follow-up. */
export function createBoardInNewTab(client: BoardCreator, target: NewBoardTarget): Promise<void> {
  if (creating) return Promise.resolve();
  creating = true;
  return client
    .createBoard(UNTITLED_BOARD)
    .then(
      ({ slug }) => target.openBoard(slug, UNTITLED_BOARD),
      (error: unknown) => target.reportError(error instanceof Error ? error.message : "The board could not be created."),
    )
    .finally(() => {
      creating = false;
    });
}

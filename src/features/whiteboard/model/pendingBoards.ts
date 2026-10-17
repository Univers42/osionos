import { create } from "zustand";

import { whiteboardClient } from "./whiteboardClient";

export type PendingBoard =
  | { status: "creating" }
  | { status: "error"; message: string }
  | { status: "created"; slug: string };

interface PendingBoardsState {
  byBlockId: Record<string, PendingBoard>;
}

export const usePendingBoards = create<PendingBoardsState>(() => ({ byBlockId: {} }));

function setPending(blockId: string, entry: PendingBoard | null): void {
  usePendingBoards.setState((state) => {
    const rest = { ...state.byBlockId };
    delete rest[blockId];
    return { byBlockId: entry ? { ...rest, [blockId]: entry } : rest };
  });
}

export function clearPendingBoard(blockId: string): void {
  setPending(blockId, null);
}

export interface BoardCreator {
  createBoard: (title: string) => Promise<{ slug: string }>;
}

export interface BoardCreationOptions {
  client?: BoardCreator;
  /** False once the block was deleted while the POST was in flight. */
  blockExists?: () => boolean;
}

/** Create the board behind one block, at most once at a time per block id. Only the
 *  client that SELECTED the command calls this; a block that arrives without a slug (another
 *  client, a reload) is shown a Create button instead and never reaches here on its own.
 *  No automatic retry: a failure is stored for the block's Retry button.
 *  `onCreated` runs only on success and only while the block still exists. The board
 *  itself stays on the service either way (it cannot be deleted from osionos). */
export function startBoardCreation(
  blockId: string,
  title: string,
  onCreated: (slug: string) => void,
  { client = whiteboardClient, blockExists = () => true }: BoardCreationOptions = {},
): Promise<void> {
  if (usePendingBoards.getState().byBlockId[blockId]?.status === "creating") return Promise.resolve();
  setPending(blockId, { status: "creating" });
  return client.createBoard(title).then(
    ({ slug }) => {
      if (!blockExists()) {
        setPending(blockId, null);
        return;
      }
      setPending(blockId, { status: "created", slug });
      onCreated(slug);
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : "The board could not be created.";
      setPending(blockId, { status: "error", message });
    },
  );
}

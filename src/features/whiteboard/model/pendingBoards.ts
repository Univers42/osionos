import { create } from "zustand";

interface PendingBoardsState {
  /** Blocks whose board hydrawn is creating in their `/new` frame right now. */
  blockIds: ReadonlySet<string>;
}

export const usePendingBoards = create<PendingBoardsState>(() => ({ blockIds: new Set() }));

/** Frame hydrawn's `/new` page for this block. Only the client that SELECTED `/whiteboard`
 *  or pressed Create calls this; a block that arrives without a slug (another client, a
 *  reload) shows a Create button instead, so two viewers never each create a board. */
export function requestNewBoard(blockId: string): void {
  usePendingBoards.setState(({ blockIds }) => (blockIds.has(blockId) ? { blockIds } : { blockIds: new Set(blockIds).add(blockId) }));
}

export function clearPendingBoard(blockId: string): void {
  usePendingBoards.setState(({ blockIds }) => {
    if (!blockIds.has(blockId)) return { blockIds };
    const next = new Set(blockIds);
    next.delete(blockId);
    return { blockIds: next };
  });
}

export function isBoardPending(blockId: string): boolean {
  return usePendingBoards.getState().blockIds.has(blockId);
}

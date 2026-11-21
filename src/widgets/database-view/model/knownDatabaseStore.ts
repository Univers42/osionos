import { create } from "zustand";
import type { NotionState } from "@notion-db/object-database";

import { persistKnownDatabaseState } from "./knownDatabaseWrite";
import { isKnownDatabaseWritable, replaceDeletedPageIds } from "./knownDatabaseSessionState";
import { seedSnapshot } from "./knownDatabaseSeed";

type KnownDatabaseStoreState = {
  state: NotionState;
  replaceState: (state: NotionState) => void;
  resetState: () => void;
  updatePageProperty: (pageId: string, propertyId: string, value: unknown) => void;
};

export const useKnownDatabaseStateStore = create<KnownDatabaseStoreState>((set) => ({
  state: seedSnapshot(), // the stored copy replaces it at readiness (restoreStoredState)
  replaceState: (state) => {
    if (isKnownDatabaseWritable()) set({ state: persistKnownDatabaseState(state) });
  },
  resetState: () => {
    if (!isKnownDatabaseWritable()) return;
    replaceDeletedPageIds(new Set());
    set({ state: persistKnownDatabaseState(seedSnapshot()) });
  },
  updatePageProperty: (pageId, propertyId, value) => set((current) => {
    const page = current.state.pages[pageId];
    if (!page || !isKnownDatabaseWritable()) return current;
    return {
      state: persistKnownDatabaseState({
        ...current.state,
        pages: {
          ...current.state.pages,
          [pageId]: {
            ...page,
            properties: { ...page.properties, [propertyId]: value },
            updatedAt: new Date().toISOString(),
            lastEditedBy: "You",
          },
        },
      }),
    };
  }),
}));

import { useEffect, useMemo } from "react";
import { createStore, type StoreApi } from "zustand/vanilla";

import type { Block } from "@/entities/block";
import { buildCanvasBlockPatch, createCanvasStateFromBlock, getBlockHydrationSignature } from "../controller/persistence";
import { canvasReducer, isPersistableCanvasAction } from "../model/canvasReducer";
import { legacySourceSignature } from "../model/migration";
import type { CanvasAction, CanvasPersistedBlockPatch, CanvasState } from "../model/types";

export const CANVAS_V2_WRITE_DEBOUNCE_MS = 200;

export type CanvasPersistHandler = (layoutBlockId: string, patch: CanvasPersistedBlockPatch) => void;

export interface CanvasStoreState extends CanvasState {
  dispatch: (action: CanvasAction) => void;
  flushPendingWrite: () => void;
  hydrateFromBlock: (block: Block) => void;
  setPersistence: (handler?: CanvasPersistHandler) => void;
}

export type CanvasStoreApi = StoreApi<CanvasStoreState>;

const stores = new Map<string, CanvasStoreApi>();

export function useCanvasStore(layoutBlockId: string, block: Block, onPersist?: CanvasPersistHandler): CanvasStoreApi {
  const store = useMemo(() => getOrCreateCanvasStore(layoutBlockId, block), [layoutBlockId, block]);

  useEffect(() => {
    store.getState().setPersistence(onPersist);
  }, [onPersist, store]);

  useEffect(() => {
    store.getState().hydrateFromBlock(block);
  }, [block, store]);

  return store;
}

export function useCanvasStoreBridge(layoutBlockId: string, block: Block, onPersist?: CanvasPersistHandler): CanvasStoreApi {
  const store = useCanvasStore(layoutBlockId, block, onPersist);
  useEffect(() => () => store.getState().flushPendingWrite(), [store]);
  return store;
}

export function getOrCreateCanvasStore(layoutBlockId: string, block: Block): CanvasStoreApi {
  const existing = stores.get(layoutBlockId);
  if (existing) return existing;
  const store = createCanvasStore(createCanvasStateFromBlock(block));
  stores.set(layoutBlockId, store);
  return store;
}

export function createCanvasStore(initialState: CanvasState): CanvasStoreApi {
  let persist: CanvasPersistHandler | undefined;
  let writeTimer: ReturnType<typeof setTimeout> | null = null;

  const store = createStore<CanvasStoreState>((set, get) => {
    const flushPendingWrite = () => {
      if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = null;
      }
      if (!persist) return;
      const state = get();
      const patch = buildCanvasBlockPatch(state);
      persist(state.layoutBlockId, patch);
      set({ migration: { ...state.migration, legacyConfig: patch.layoutConfig, sourceSignature: legacySourceSignature(patch.layoutConfig, patch.layoutCells) } });
    };

    const scheduleWrite = () => {
      if (writeTimer) clearTimeout(writeTimer);
      writeTimer = setTimeout(flushPendingWrite, CANVAS_V2_WRITE_DEBOUNCE_MS);
    };

    return {
      ...initialState,
      dispatch: (action) => {
        set((state) => canvasReducer(state, action));
        if (isPersistableCanvasAction(action)) scheduleWrite();
      },
      flushPendingWrite,
      hydrateFromBlock: (block) => {
        if (writeTimer) return;
        const signature = getBlockHydrationSignature(block);
        if (signature === get().migration.sourceSignature) return;
        set(createCanvasStateFromBlock(block));
      },
      setPersistence: (handler) => {
        persist = handler;
      },
    };
  });

  return store;
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   canvasStore.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

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

interface CanvasStoreEntry {
  store: CanvasStoreApi;
  refs: number;
  evictTimer: ReturnType<typeof setTimeout> | null;
}

const stores = new Map<string, CanvasStoreEntry>();
const STORE_EVICT_GRACE_MS = 30_000;

export function useCanvasStore(layoutBlockId: string, block: Block, onPersist?: CanvasPersistHandler): CanvasStoreApi {
  // `block` is only consulted when the store is first created; hydration of
  // later block versions happens in the dedicated effect below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const store = useMemo(() => getOrCreateCanvasStore(layoutBlockId, block), [layoutBlockId]);

  useEffect(() => {
    // Refcounted retention: the store survives unmounts for a grace window
    // (tab switches keep undo history) but closed pages stop leaking entries.
    const entry = stores.get(layoutBlockId);
    if (entry) {
      entry.refs += 1;
      if (entry.evictTimer) clearTimeout(entry.evictTimer);
      entry.evictTimer = null;
    }
    return () => {
      const current = stores.get(layoutBlockId);
      if (!current) return;
      current.refs -= 1;
      if (current.refs > 0) return;
      current.evictTimer = setTimeout(() => {
        current.store.getState().flushPendingWrite();
        stores.delete(layoutBlockId);
      }, STORE_EVICT_GRACE_MS);
    };
  }, [layoutBlockId]);

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
  if (existing) return existing.store;
  const store = createCanvasStore(createCanvasStateFromBlock(block));
  stores.set(layoutBlockId, { store, refs: 0, evictTimer: null });
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
        // Deliberate last-writer-wins: while a local write is pending, the
        // user's in-flight edit outranks any external block version.
        if (writeTimer) return;
        const signature = getBlockHydrationSignature(block);
        if (signature === get().migration.sourceSignature) return;
        // Merge-hydrate: nested cell content commits through the page store
        // (every draft flush), so a full state replacement here would wipe
        // selection, history, and viewport on each typing pause.
        const fresh = createCanvasStateFromBlock(block);
        const previous = get();
        const liveIds = new Set(fresh.cells.map((cell) => cell.id));
        set({
          ...fresh,
          viewport: previous.viewport,
          tool: previous.tool,
          history: previous.history,
          selectedIds: previous.selectedIds.filter((id) => liveIds.has(id)),
        });
      },
      setPersistence: (handler) => {
        persist = handler;
      },
    };
  });

  return store;
}

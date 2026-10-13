/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useExplorerTree.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useEffect, useRef, useState } from "react";

import { isFsError } from "../vfs/errors";
import { buildExplorerRows, type DirState } from "./explorerRows";
import type { WorkspaceFileOps } from "./workspaceFileOps";

const WATCH_DEBOUNCE_MS = 150;

/** One sentence a user can act on, whatever the thrown thing was. */
export function describeError(error: unknown): string {
  if (isFsError(error)) return error.message;
  return error instanceof Error ? error.message : String(error);
}

/** Lazy directory cache + expansion state for the explorer. A directory is listed
 *  the first time it opens; later `refresh()` re-lists every directory ever loaded
 *  (cheap and keeps collapsed caches fresh), keeping old rows on screen meanwhile.
 *  Ponytail: refresh is whole-cache, not per-path, and watch events are debounced
 *  into one such refresh, so a busy provider costs one listing per loaded folder
 *  per 150 ms burst, never a missed update. */
export function useExplorerTree(ops: WorkspaceFileOps) {
  const [dirs, setDirs] = useState<Readonly<Record<string, DirState>>>({});
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [watchNotice, setWatchNotice] = useState<string | null>(null);
  const generation = useRef(0);
  const loaded = useRef(new Set<string>());
  // Latest request per directory: a slow older listing must not overwrite a newer one.
  const latest = useRef(new Map<string, number>());
  const abort = useRef<AbortController | null>(null);
  const requestId = useRef(0);

  // No synchronous setState: the initial root listing runs from an effect.
  const fetchDir = useCallback((dir: string): Promise<void> => {
    const gen = generation.current;
    const id = ++requestId.current;
    loaded.current.add(dir);
    latest.current.set(dir, id);
    const settle = (next: DirState): void => {
      if (gen === generation.current && latest.current.get(dir) === id) setDirs((prev) => ({ ...prev, [dir]: next }));
    };
    return ops.list(dir, abort.current?.signal).then(
      (entries) => settle({ status: "ready", rows: buildExplorerRows(entries) }),
      (error: unknown) => settle({ status: "error", message: describeError(error) }),
    );
  }, [ops]);

  // User-initiated listing: shows "Loading" unless rows are already on screen.
  const load = useCallback((dir: string): Promise<void> => {
    setDirs((prev) => (prev[dir]?.status === "ready" ? prev : { ...prev, [dir]: { status: "loading" } }));
    return fetchDir(dir);
  }, [fetchDir]);

  const refresh = useCallback(
    (): Promise<unknown> => Promise.all([...loaded.current].map((dir) => fetchDir(dir))),
    [fetchDir],
  );

  // New ops = new mount: drop the old tree during render (the sanctioned
  // derived-state reset), then invalidate in-flight loads and list the root.
  const [boundOps, setBoundOps] = useState(ops);
  if (boundOps !== ops) {
    setBoundOps(ops);
    setDirs({});
    setExpanded(new Set());
  }

  // The cleanup runs on unmount and before a new ops: it aborts and invalidates
  // every in-flight listing so none can set state on a gone tree.
  useEffect(() => {
    generation.current += 1;
    loaded.current = new Set();
    latest.current = new Map();
    const controller = new AbortController();
    abort.current = controller;
    void fetchDir("");
    return () => {
      generation.current += 1;
      controller.abort();
    };
  }, [fetchDir]);

  useEffect(() => {
    if (!ops.canWatch()) return undefined;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    ops.watch("", () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), WATCH_DEBOUNCE_MS);
    }, controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted) setWatchNotice(`Live updates are off: ${describeError(error)}. Use Refresh.`);
    });
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [ops, refresh]);

  const setOpen = useCallback((dir: string, open: boolean): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.add(dir);
      else next.delete(dir);
      return next;
    });
    if (open) void load(dir);
  }, [load]);

  // One state update, O(1): clears every expanded directory at once.
  const collapseAll = useCallback((): void => {
    setExpanded(new Set());
  }, []);

  return { dirs, expanded, setOpen, collapseAll, load, refresh, watchNotice };
}

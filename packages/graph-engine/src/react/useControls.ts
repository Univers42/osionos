/**
 * Controls state hook: holds the console's Controls object, persists it to
 * localStorage (keyed per host), and exposes a single `update(mutator)` that
 * clones-then-mutates so React sees a new reference each change. The engine binds
 * to `controls`; panels call `update`.
 */

import { useCallback, useMemo, useState } from "react";
import { type Controls, DEFAULT_CONTROLS, cloneControls } from "../core/state/controls";

export interface UseControls {
  controls: Controls;
  update: (mutate: (draft: Controls) => void) => void;
  reset: () => void;
}

export function useControls(storageKey = "osio-graph-controls"): UseControls {
  const [controls, setControls] = useState<Controls>(() => load(storageKey));

  const update = useCallback(
    (mutate: (draft: Controls) => void) => {
      setControls((prev) => {
        const next = cloneControls(prev);
        mutate(next);
        save(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const reset = useCallback(() => {
    const fresh = cloneControls(DEFAULT_CONTROLS);
    save(storageKey, fresh);
    setControls(fresh);
  }, [storageKey]);

  return useMemo(() => ({ controls, update, reset }), [controls, update, reset]);
}

function load(key: string): Controls {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return cloneControls(DEFAULT_CONTROLS);
    const parsed = JSON.parse(raw) as Partial<Controls>;
    const base = cloneControls(DEFAULT_CONTROLS);
    return {
      filter: { ...base.filter, ...parsed.filter },
      physics: { ...base.physics, ...parsed.physics },
      visual: { ...base.visual, ...parsed.visual },
      search: { ...base.search, ...parsed.search },
    };
  } catch {
    return cloneControls(DEFAULT_CONTROLS);
  }
}

function save(key: string, controls: Controls): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(controls));
  } catch {
    /* storage unavailable (private mode / SSR) — ignore */
  }
}

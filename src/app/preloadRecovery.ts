// Stale-chunk recovery: after a redeploy a lazy import 404s and Vite fires `vite:preloadError`;
// reloading once fetches the fresh manifest. The loop guard lives in sessionStorage because a reload
// discards every module variable (an in-memory guard would never stop a loop of reloads).
//
// Firefox and WebKit cancel the lazy imports still in flight when a navigation starts and fire the
// event for each; a reload then aborts that navigation. `beforeunload` precedes the first such event
// (75/75 interrupted runs, gap 0-54 ms) and never precedes a real stale chunk (0/150), so the page is
// marked "leaving" from it and the reload waits (ADR 0061).
//
// Caveat: heuristic, localhost measurements, a modelled redeploy. It gets wrong:
//  (i) a `beforeunload` that does not unload (Stay on page, Stop, a 204, a download) delays recovery
//      by up to GUARD_WINDOW_MS, then one reload happens if a failure was swallowed;
//  (ii) a navigation still pending when the mark clears, whose imports were cancelled, is aborted once;
//  (iii) where `beforeunload` does not fire (iOS Safari is reported not to; unmeasured) behaviour
//      is the old one, reload on every failure;
//  (iv) staleness was simulated with request interception, not a real redeploy.

const GUARD_KEY = "osionos:preload-reloaded-at";
const GUARD_WINDOW_MS = 10_000;

export interface RecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface RecoveryDeps {
  storage: RecoveryStorage | undefined;
  now: () => number;
  reload: () => void;
}

/** `globalThis.sessionStorage` itself throws in some privacy modes. */
export function readSessionStorage(): RecoveryStorage | undefined {
  try {
    return globalThis.sessionStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/** True only when this call took the guard and the write reads back, so a reload cannot repeat. */
function takeGuard({ storage, now }: Pick<RecoveryDeps, "storage" | "now">): boolean {
  if (!storage) return false;
  try {
    const at = now();
    if (at - Number(storage.getItem(GUARD_KEY) ?? 0) <= GUARD_WINDOW_MS) return false;
    storage.setItem(GUARD_KEY, String(at));
    return storage.getItem(GUARD_KEY) === String(at);
  } catch {
    return false;
  }
}

/** Stands down while the document is leaving; recovers what it skipped if the page outlives the mark. */
export function installPreloadRecovery(target: EventTarget, deps: RecoveryDeps): void {
  const reloadOnce = () => {
    if (takeGuard(deps)) deps.reload();
  };
  let leaving = false;
  let skipped = false;
  let markTimer: ReturnType<typeof setTimeout> | undefined;
  const clearMark = () => {
    clearTimeout(markTimer);
    leaving = false;
    if (skipped) reloadOnce();
    skipped = false;
  };
  target.addEventListener("beforeunload", () => {
    leaving = true;
    clearTimeout(markTimer);
    markTimer = setTimeout(clearMark, GUARD_WINDOW_MS);
  }, true);
  target.addEventListener("pageshow", (event) => {
    if ((event as PageTransitionEvent).persisted) clearMark();
  });
  target.addEventListener("vite:preloadError", () => {
    if (leaving) skipped = true;
    else reloadOnce();
  });
}

// Stale-chunk recovery: after a redeploy a lazy import 404s and Vite fires `vite:preloadError`;
// reloading once fetches the fresh manifest. The loop guard lives in sessionStorage because a reload
// discards every module variable (an in-memory guard would never stop a loop of reloads).

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

export function installPreloadRecovery(target: EventTarget, deps: RecoveryDeps): void {
  target.addEventListener("vite:preloadError", () => {
    if (takeGuard(deps)) deps.reload();
  });
}

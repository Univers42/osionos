import type { NotionState } from "@notion-db/object-database";

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function cloneState(state: NotionState): NotionState {
  return clone(state);
}

export function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Array.from(globalThis.crypto.getRandomValues(new Uint32Array(2)), (n) => n.toString(36)).join('')}`;
}

// Vite folds this chain to `true` in a production build; node tests have no env.
const IS_PRODUCTION_BUILD = (import.meta as { env?: { PROD?: boolean } }).env?.PROD === true;

/** Every mounted database reads the account state itself: a copy cost 19.5 ms
 *  per open on 8,646 rows and one more copy of every row per mount. Sharing is
 *  safe because the stores replace objects and never write into them.
 *  Caveat: only dev and test builds freeze the state, so a write into it that
 *  happens on a production-only path goes unnoticed there; the dev e2e suite
 *  is the net. */
export function shareState(state: NotionState): NotionState {
  if (!IS_PRODUCTION_BUILD) deepFreeze(state);
  return state;
}

// Stops at an already-frozen object: the state is frozen on every open, and
// only the objects an edit replaced are new since the last one.
function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
}

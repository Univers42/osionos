import type { NotionState } from "@notion-db/object-database";

import { timed } from "@osionos/perf-probe";
import { pushDirtyObjectDatabases } from "./objectDatabaseBridgeSync";
import { createKeptStateReporter, createKnownStateWriter } from "./knownDatabaseStorage";
import { createFlushSchedule } from "./knownDatabaseFlushSchedule";
import { serializeKnownDatabaseState } from "./knownDatabasePersistedState";
import { getDeletedPageIds, getKnownDatabasePersistence, isKnownDatabaseWritable } from "./knownDatabaseSessionState";
import { seedDatabaseIds } from "./knownDatabaseSeed";

let pendingKnownDatabaseState: NotionState | null = null;

export function persistKnownDatabaseState(state: NotionState): NotionState {
  if (!isKnownDatabaseWritable()) return state;
  // No clone here: `state` is built immutably by every caller (zustand set
  // replaces objects, never mutates), so recording the ref is safe until the
  // debounced flush snapshots it. Cloning here ran structuredClone over the
  // WHOLE NotionState synchronously on every cell edit.
  scheduleKnownDatabaseStatePersist(state);
  return state;
}

export function flushKnownDatabaseStatePersist(pushNow = false) {
  flushSchedule.cancel();

  if (!pendingKnownDatabaseState) return;

  const pendingState = pendingKnownDatabaseState;
  pendingKnownDatabaseState = null;

  const persistence = getKnownDatabasePersistence();
  if (persistence?.mode() === "idb") persistence.flush(pendingState, pushNow);
  else if (globalThis.window !== undefined) writeToLocalStorage(pendingState, pushNow);
}

function writeToLocalStorage(pendingState: NotionState, pushNow: boolean): void {
  // No snapshot: the store replaces objects and never mutates them (see
  // persistKnownDatabaseState), so the pending ref is already a stable
  // snapshot. structuredClone of the whole state was half of this flush —
  // 54 ms with a 5k-row table, landing ~1 s after an edit, i.e. while the
  // user is still typing.
  timed("persistKnownDatabaseState", () => writeKnownState(serializeKnownDatabaseState(pendingState, getDeletedPageIds())));
  // Write-through: mirror every user-created database to the server (bridge →
  // Postgres, owner-isolated). No-ops offline / without a session — see module.
  // Its own task: hashing every user slice must not stack on the local write
  // (a page being unloaded gets no later task, so it pushes now).
  const push = () => pushDirtyObjectDatabases(pendingState, seedDatabaseIds(), getDeletedPageIds());
  if (pushNow) push();
  else globalThis.setTimeout(push, 0);
}

// Makes room in the page caches when the origin is full (knownDatabaseStorage). The durable
// copy's failed commit raises the same warning and unload guard (K9).
export const reportKeptState = createKeptStateReporter(() => flushKnownDatabaseStatePersist(true));
const writeKnownState = createKnownStateWriter(() => flushKnownDatabaseStatePersist(true), undefined, reportKeptState);

const flushSchedule = createFlushSchedule(() => flushKnownDatabaseStatePersist());

function scheduleKnownDatabaseStatePersist(state: NotionState) {
  pendingKnownDatabaseState = state;
  flushSchedule.schedule();
}

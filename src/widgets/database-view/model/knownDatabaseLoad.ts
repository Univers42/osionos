import type { NotionState, SchemaProperty } from "@notion-db/object-database";

import { rebaseHomeDemoDates } from "./homeDemoSeed";
import { defaultStatusSchema } from "@/shared/notion-database-sys/src/store/slices/statusDefaults";
import { loadPersistedKnownDatabaseState } from "./knownDatabasePersistedState";
import { cloneState } from "./knownDatabaseClone";
import { notifyObjectDatabaseAdaptersReloaded } from "./knownDatabaseAdapter";
import { replaceDeletedPageIds } from "./knownDatabaseSessionState";
import { seedSnapshot } from "./knownDatabaseSeed";
import { useKnownDatabaseStateStore } from "./knownDatabaseStore";

/** Notion parity: a `status` property is never optionless. Legacy databases
 *  created before the status-seed shipped persist a status column with zero
 *  options — an empty, unusable picker. Backfill the three default states
 *  (To-do / In Progress / Complete) on load so every status is pickable. */
function withStatusDefaults(state: NotionState): NotionState {
  let changed = false;
  const databases: NotionState["databases"] = { ...state.databases };
  for (const [dbId, database] of Object.entries(state.databases)) {
    let props: Record<string, SchemaProperty> | null = null;
    for (const [propId, prop] of Object.entries(database.properties)) {
      if (prop.type === "status" && (prop.options?.length ?? 0) === 0) {
        props ??= { ...database.properties };
        props[propId] = { ...prop, ...defaultStatusSchema(propId) };
      }
    }
    if (props) {
      databases[dbId] = { ...database, properties: props };
      changed = true;
    }
  }
  return changed ? { ...state, databases } : state;
}

/** A copy of the store's state; it holds the stored data only after whenKnownDatabaseReady(). */
export function loadKnownDatabaseState(): NotionState {
  return cloneState(useKnownDatabaseStateStore.getState().state);
}

/** I9: the stored copy replaces the whole store, tombstones included; the seed when none. */
export function restoreStoredState(text: string | null): void {
  const restored = text ? readStoredState(text) : null;
  replaceDeletedPageIds(restored?.deletedPageIds ?? new Set());
  useKnownDatabaseStateStore.setState({ state: restored?.state ?? seedSnapshot() });
  notifyObjectDatabaseAdaptersReloaded();
}

function readStoredState(text: string): { state: NotionState; deletedPageIds: Set<string> } | null {
  try {
    const loaded = loadPersistedKnownDatabaseState(text, seedSnapshot());
    return { state: withStatusDefaults(rebaseHomeDemoDates(loaded.state)), deletedPageIds: loaded.deletedPageIds };
  } catch {
    return null;
  }
}

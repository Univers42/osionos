import { ensureObjectDatabaseHydration, type ObjectDatabaseSyncHooks } from "./objectDatabaseBridgeSync";
import { useDatabaseStore } from "@/store/useDatabaseStore";
import type { KnownDatabaseAdapterOptions } from "./knownDatabaseViewLimit";
import {
  getCachedKnownDatabaseAdapter,
  notifyObjectDatabaseAdaptersReloaded,
  type PersistableObjectDatabaseAdapter,
} from "./knownDatabaseAdapter";
import {
  getDeletedPageIds,
  getKnownDatabasePersistence,
  replaceDeletedPageIds,
  whenKnownDatabaseReady,
} from "./knownDatabaseSessionState";
import { seedDatabaseIds, seedPageIds } from "./knownDatabaseSeed";
import { useKnownDatabaseStateStore } from "./knownDatabaseStore";
import { persistKnownDatabaseState } from "./knownDatabaseWrite";

export function getKnownDatabaseAdapter(options: KnownDatabaseAdapterOptions = {}): PersistableObjectDatabaseAdapter {
  // First use of an object database → reconcile local ⇄ server once this session
  // (pull server truth, auto-repair any browser-only databases up to Postgres).
  ensureObjectDatabaseHydration(objectDatabaseSyncHooks);
  return getCachedKnownDatabaseAdapter(options);
}

/** Make every synced object database appear in the sidebar "Your databases"
 *  list — its registry (`useDatabaseStore.created`) is local-only and never ran
 *  createInlineDatabase on this device, so derive each entry from the state. */
function reconcileObjectDatabaseRegistry(userDbKeys: string[]): void {
  const { databases, views } = useKnownDatabaseStateStore.getState().state;
  const entries = userDbKeys
    .filter((dbKey) => databases[dbKey])
    .map((dbKey) => ({
      id: dbKey,
      name: (databases[dbKey] as { name?: string }).name ?? "Untitled Database",
      viewId: Object.values(views).find((view) => view.databaseId === dbKey)?.id ?? `${dbKey}-table`,
    }));
  if (entries.length) useDatabaseStore.getState().ensureRegistered(entries);
}

/** Drop the tombstones the server no longer needs: the deleted row is gone
 *  from every server slice, so the server agrees it is dead and the tombstone
 *  is dead weight (it would pile up in localStorage for every deletion the
 *  user ever made). The code seed is the one exception — it fills every page
 *  the snapshot lacks and the server never holds seed pages — so a seed row's
 *  tombstone stays until the seed itself drops that page. */
function pruneDeletedPageIds(stillNeeded: ReadonlySet<string>): void {
  const current = getDeletedPageIds();
  const kept = new Set(stillNeeded);
  for (const pageId of seedPageIds()) {
    if (current.has(pageId)) kept.add(pageId);
  }
  if (kept.size === current.size) return; // nothing to drop
  replaceDeletedPageIds(kept);
  // Re-persist: the stored snapshot must shrink together with the tombstones.
  persistKnownDatabaseState(useKnownDatabaseStateStore.getState().state);
}

const objectDatabaseSyncHooks: ObjectDatabaseSyncHooks = {
  whenReady: whenKnownDatabaseReady,
  getSeedIds: seedDatabaseIds,
  getLiveState: () => useKnownDatabaseStateStore.getState().state,
  getDeletedPageIds,
  pruneDeletedPageIds,
  // A pull-only tab still shows the server's copy; it only never writes it back (I7).
  applyMerged: (state) => {
    if (getKnownDatabasePersistence()?.mode() === "fallback-flagged") useKnownDatabaseStateStore.setState({ state });
    else useKnownDatabaseStateStore.getState().replaceState(state);
  },
  notifyReloaded: notifyObjectDatabaseAdaptersReloaded,
  reconcileRegistry: reconcileObjectDatabaseRegistry,
};

/** Kick the object-database server sync once, eagerly, on app start — so a fresh
 *  browser pulls the account's databases (into the store AND the sidebar) without
 *  first having to open one. Safe/no-op offline, without a session, or if off. */
export function startObjectDatabaseSync(): void {
  ensureObjectDatabaseHydration(objectDatabaseSyncHooks);
}

export { resetObjectDatabaseSync } from "./objectDatabaseBridgeSync";

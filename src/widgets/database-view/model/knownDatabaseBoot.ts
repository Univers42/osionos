import { createKnownDatabasePersistence } from "./knownDatabasePersistence";
import { knownDatabaseUnloadJournal, openKnownDatabaseDurableCopy } from "./knownDatabaseDurableStore";
import { watchKnownDatabaseUnload } from "./knownDatabaseUnload";
import { serializeKnownDatabaseState } from "./knownDatabasePersistedState";
import { warnReadOnlyDatabases } from "./knownDatabaseStorage";
import { restoreStoredState } from "./knownDatabaseLoad";
import { getDeletedPageIds, getKnownDatabasePersistence, setKnownDatabasePersistence } from "./knownDatabaseSessionState";
import { seedDatabaseIds, seedSnapshot } from "./knownDatabaseSeed";
import { useKnownDatabaseStateStore } from "./knownDatabaseStore";
import { flushKnownDatabaseStatePersist, reportKeptState } from "./knownDatabaseWrite";

/** K2: one durable copy per tab, opened when the facade is first evaluated;
 *  a no-op without a window (tests, prerender) or when already open. */
export function openKnownDatabasePersistence(): void {
  if (globalThis.window === undefined || getKnownDatabasePersistence()) return;
  setKnownDatabasePersistence(createKnownDatabasePersistence({
    durable: openKnownDatabaseDurableCopy(() => serializeKnownDatabaseState(seedSnapshot(), new Set())),
    load: restoreStoredState,
    getLiveState: () => useKnownDatabaseStateStore.getState().state,
    serialize: (state) => serializeKnownDatabaseState(state, getDeletedPageIds()),
    getSeedIds: seedDatabaseIds,
    getDeletedPageIds,
    reportCommit: reportKeptState,
    warnReadOnly: warnReadOnlyDatabases,
    unloadJournal: knownDatabaseUnloadJournal(),
  }));
  // pagehide, not beforeunload: it fires after every beforeunload handler, so a
  // write the database host flushes from its own beforeunload still lands here.
  watchKnownDatabaseUnload(
    { flushPending: flushKnownDatabaseStatePersist, persistence: getKnownDatabasePersistence },
    globalThis,
    globalThis.document,
  );
}

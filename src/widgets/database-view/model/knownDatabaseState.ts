// Facade: the public surface of the known-database store. The pieces live in
// knownDatabase{SessionState,Clone,Seed,PageQuery,Write,Store,Adapter,Load,ServerSync,Boot}.ts
// (dependencies point one way, in that order). Evaluating this file opens the durable copy.
import { openKnownDatabasePersistence } from "./knownDatabaseBoot";

export { KNOWN_DATABASE_STATE_STORAGE_KEY } from "./knownDatabaseStorage";
export { isKnownDatabaseWritable, whenKnownDatabaseReady, getDeletedPageIds } from "./knownDatabaseSessionState";
export { seedSnapshot } from "./knownDatabaseSeed";
export { persistKnownDatabaseState, flushKnownDatabaseStatePersist } from "./knownDatabaseWrite";
export { useKnownDatabaseStateStore } from "./knownDatabaseStore";
export { createKnownDatabaseAdapter, type PersistableObjectDatabaseAdapter } from "./knownDatabaseAdapter";
export { loadKnownDatabaseState, restoreStoredState } from "./knownDatabaseLoad";
export { getKnownDatabaseAdapter, startObjectDatabaseSync, resetObjectDatabaseSync } from "./knownDatabaseServerSync";

openKnownDatabasePersistence();

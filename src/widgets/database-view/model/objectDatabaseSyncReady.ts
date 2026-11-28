import { API_BASE } from "@/shared/api/client";
import { isObjectDatabaseServerSyncEnabled } from "@/shared/config/featureFlags";

/** Sync is possible only client-side, with the flag on and a bridge URL set
 *  (the offline/Playwright build blanks `VITE_API_URL`, so it no-ops there).
 *  Kept in its own file so the app shell can ask without loading the database state. */
export function objectDatabaseServerSyncReady(): boolean {
  return globalThis.window !== undefined && Boolean(API_BASE) && isObjectDatabaseServerSyncEnabled();
}

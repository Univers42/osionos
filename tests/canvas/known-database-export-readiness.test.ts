/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   known-database-export-readiness.test.ts            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// An export started right after load must carry the user's databases, not the seed the store
// holds until the durable copy is read.

import assert from "node:assert/strict";
import test from "node:test";

await import("./support/memory-local-storage.ts");
await import("./support/stub-bridge.ts");
const { installRefusingBrowser } = await import("./support/refusing-indexed-db.ts");
installRefusingBrowser(150);
const { EMPTY, withDb, valuesOf } = await import("./support/kds-tab.ts");
const { serializeKnownDatabaseState } = await import("../../src/widgets/database-view/model/knownDatabasePersistedState.ts");

globalThis.localStorage.setItem("osionos.knownDatabaseState.v1", serializeKnownDatabaseState(withDb(EMPTY, "db-mine", ["kept"]), new Set()));
const { loadExportDatabaseState } = await import("../../src/features/page-export/model/exportDatabaseState.ts");

test("(v) the export waits for readiness and reads the loaded copy", async () => {
  const state = await loadExportDatabaseState();
  assert.deepEqual(valuesOf(state ?? undefined, "db-mine"), ["kept"]);
});

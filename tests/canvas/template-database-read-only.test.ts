/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   template-database-read-only.test.ts                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Devil C3 (ADR 0054): a pull-only tab's store refuses the template's databases, and the sidebar
// registry and the workspace map then listed databases with no state behind them. The template is
// now refused before any write, and the toast says why.

import assert from "node:assert/strict";
import test from "node:test";
import type { Block } from "../../src/entities/block/index.ts";

await import("./support/memory-local-storage.ts");
await import("./support/stub-bridge.ts");
const { installRefusingBrowser } = await import("./support/refusing-indexed-db.ts");
installRefusingBrowser(20);
globalThis.localStorage.setItem("osionos.kds.idb", "1"); // this origin's copy lives in IndexedDB only
const kds = await import("../../src/widgets/database-view/model/knownDatabaseState.ts");
const { instantiateTemplateDatabases } = await import("../../src/widgets/database-view/model/templateDatabaseInstantiate.ts");
const { useDatabaseStore } = await import("../../src/store/useDatabaseStore.ts");
const { databaseWorkspace } = await import("../../src/widgets/database-view/model/objectDatabaseWorkspaces.ts");
const { notifyTemplateFailure } = await import("../../src/store/pageCreateFeedback.ts");
const { useToastStore } = await import("@osionos/ui/primitives/useToastStore");

// Every minted id is then predictable: a database clone is "db-00000000".
Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: () => "00000000-0000-4000-8000-000000000000" });

function templateOnSeedDatabase(): Block[] {
  const view = Object.values(kds.useKnownDatabaseStateStore.getState().state.views)[0];
  assert.ok(view, "the seed ships a view");
  return [{ id: "b1", type: "database_inline", content: "", databaseId: view.databaseId, viewId: view.id }] as unknown as Block[];
}

test("a fallback-flagged tab instantiating a template creates no registry and no workspace entries", async () => {
  await kds.whenKnownDatabaseReady();
  const state = kds.useKnownDatabaseStateStore.getState().state;
  const registered = useDatabaseStore.getState().created.length;
  const error = await instantiateTemplateDatabases(templateOnSeedDatabase(), "ws-1").then(() => null, (thrown: unknown) => thrown);
  assert.equal(useDatabaseStore.getState().created.length, registered, "no registry entry");
  assert.equal(databaseWorkspace("db-00000000"), undefined, "no workspace entry");
  assert.equal(kds.useKnownDatabaseStateStore.getState().state, state, "the store is untouched");
  assert.equal((error as Error | null)?.name, "KnownDatabaseReadOnlyError");
});

test("a template without databases still instantiates in a read-only tab", async () => {
  const content = [{ id: "h", type: "heading_1", content: "Notes" }] as unknown as Block[];
  assert.equal(await instantiateTemplateDatabases(content, "ws-1"), content);
});

test("the toast for a read-only tab says why the template failed and what to do", async () => {
  useToastStore.getState().clear();
  const error = await instantiateTemplateDatabases(templateOnSeedDatabase(), "ws-1").then(() => null, (thrown: unknown) => thrown);
  assert.equal(notifyTemplateFailure(error), null);
  notifyTemplateFailure(new Error("network"));
  const [readOnly, other] = useToastStore.getState().toasts.map((toast) => toast.description);
  assert.match(String(readOnly), /read-only in this tab.*Reload the tab/);
  assert.equal(other, "Couldn't create the page from this template.");
});

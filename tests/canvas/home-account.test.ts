/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   home-account.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The account Home holds only what a user could build: every block comes from
// the `/` menu, and every widget on the four starter dashboards is one the
// dashboard picker offers over the source's own columns.
//
// The state module reads the auth barrel (session signal); it is stubbed with a
// plain store, as in sys-data-sources.test.ts. The transport is injected.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";

const AUTH_STUB = `
globalThis.__sysAuth = { activeUserId: "u1", sessions: { u1: { accessToken: "t1" } } };
export const useUserStore = { getState: () => globalThis.__sysAuth, subscribe: () => () => {} };
`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    if (resolved.url.endsWith("/src/features/auth/index.ts")) {
      return { url: `data:text/javascript,${encodeURIComponent(AUTH_STUB)}`, shortCircuit: true };
    }
    return resolved;
  },
});

const catalog = await import("../../src/widgets/database-view/model/sysDataSources.ts");
const state = await import("../../src/widgets/database-view/model/sysDatabaseState.ts");
const { buildSysSlashCommands } = await import("../../src/features/slash-commands/model/sysSlashCommands.ts");
const { createHomeLayoutContent } = await import("../../src/widgets/database-view/model/databaseViewCatalog.ts");
const { COLLECTION_SLASH_ITEMS } = await import("../../src/shared/ui/assets/collectionSlashItems.ts");
const { useToastStore } = await import("@osionos/ui/primitives/useToastStore");
const ENGINE = "../../src/shared/notion-database-sys/src/components/views/dashboard/notion/model";
const { statEntries } = await import(`${ENGINE}/statEntries.ts`);
const { chartEntries, recordEntries } = await import(`${ENGINE}/widgetEntries.ts`);

type Row = Record<string, unknown>;
const fixture: { id: string; columns: string[] }[] = JSON.parse(
  readFileSync(new URL("../fixtures/sys-sources.json", import.meta.url), "utf8"),
);
const columnsOf = (source: string): string[] => fixture.find((entry) => entry.id === source)!.columns;
// Only accepted connections: the Requests tile must still be one the picker offers.
const ROWS: Record<string, Row[]> = {
  "my-connections": [{ id: "c1", status: "accepted", source: "manual", created_at: "2026-10-01T00:00:00Z", peer: "Ada" }],
};
const transport = (source: string, writes: string[] = []) => ({
  async get<T>(path: string): Promise<T> {
    if (path.includes("/views/")) return { ok: true, views: {} } as T;
    return { ok: true, source, columns: columnsOf(source), rows: ROWS[source] ?? [], truncated: false } as T;
  },
  async put<T>(path: string): Promise<T> { writes.push(`PUT ${path}`); return { ok: true, views: {} } as T; },
  async delete<T>(path: string): Promise<T> { writes.push(`DELETE ${path}`); return { ok: true, views: {} } as T; },
});
const sleep = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const HOME_SOURCES = ["my-tasks", "my-pages", "my-connections", "my-workspaces"];

test("each starter dashboard is one the picker can rebuild over the source's columns", async () => {
  for (const source of HOME_SOURCES) {
    const entry = catalog.sysSourceById(`sys:${source}`)!;
    const dashboard = (entry.builtInViews ?? []).find((view: { id: string }) => view.id === `${source}-home-dashboard`);
    assert.ok(dashboard?.editable, `${source} ships an editable home dashboard`);
    const loaded = await state.loadSysSourceState(entry.id, transport(source));
    const properties = loaded.state.databases[entry.id].properties;
    const offered = {
      stat: statEntries(properties).map((offer: { stat: unknown }) => offer.stat),
      chart: chartEntries(properties).map((offer: { chart: unknown }) => offer.chart),
      records: recordEntries(properties).map((offer: { records: unknown }) => offer.records),
    };
    for (const widget of dashboard.settings.dashboardWidgets) {
      const where = `${dashboard.id}/${widget.id}`;
      assert.equal(widget.viewId, dashboard.id, `${where} reads the dashboard's own records`);
      const kinds = (["stat", "chart", "records"] as const).filter((kind) => widget[kind]);
      assert.equal(kinds.length, 1, `${where} has one presentation`);
      assert.ok(offered[kinds[0]].some((offer: unknown) => isDeepStrictEqual(offer, widget[kinds[0]])), `${where} is a picker entry`);
    }
  }
});

test("every Home block can be inserted from the / menu, and no home_views block remains", () => {
  const insertable = new Set<string>(COLLECTION_SLASH_ITEMS.map((item: { type: string }) => item.type));
  // Caveat: the locally added slash blocks are read from the catalog's source text, so a
  // blockType built at runtime would be missed (under-reporting what `/` can insert).
  const local = readFileSync(new URL("../../src/features/slash-commands/model/slashMenuCatalog.tsx", import.meta.url), "utf8");
  for (const match of local.matchAll(/blockType: "([a-z_0-9]+)"/g)) insertable.add(match[1]);
  const databases = buildSysSlashCommands();
  const walk = (blocks: { type: string; children?: unknown[] }[], parent?: string): void => {
    for (const block of blocks as Array<Record<string, unknown> & { type: string; children?: never[] }>) {
      const where = `${block.type} ${String(block.id)}`;
      if (block.type === "column") assert.equal(parent, "column_list", `${where} sits in columns`);
      else assert.ok(insertable.has(block.type), `${where} is in the / menu`);
      if (block.type === "database_inline") {
        const command = databases.find((candidate: { databaseId: string }) => candidate.databaseId === block.databaseId);
        assert.ok(command, `${where} source ${String(block.databaseId)} is in the My data group`);
        const views = [command.viewId, ...(catalog.sysSourceById(command.databaseId)?.builtInViews ?? []).map((view: { id: string }) => view.id)];
        assert.ok(views.includes(block.viewId), `${where} view ${String(block.viewId)} is one of the source's views`);
      }
      if (block.children) walk(block.children, block.type);
    }
  };
  const home = createHomeLayoutContent("Ada", { idScope: "test" });
  walk(home);
  assert.ok(home.some((block: { databaseId?: string }) => block.databaseId === "sys:my-tasks"), "Home shows your tasks");
});

test("an unchanged starter dashboard is not saved on load; a renamed tile is, under its own id", async () => {
  state.clearSysSourceStateCache();
  const writes: string[] = [];
  const adapter = state.getSysDatabaseAdapter("sys:my-tasks", transport("my-tasks", writes));
  const loaded = await adapter.loadState();
  adapter.persistState(loaded, { ...loaded, views: {} });
  await sleep();
  assert.deepEqual(writes, []);
  const dashboard = loaded.views["my-tasks-home-dashboard"];
  const widgets = dashboard.settings.dashboardWidgets.map((widget: { id: string }) => (widget.id === "open" ? { ...widget, title: "To do" } : widget));
  adapter.persistState({ ...loaded, views: { ...loaded.views, [dashboard.id]: { ...dashboard, settings: { ...dashboard.settings, dashboardWidgets: widgets } } } }, loaded);
  await sleep();
  assert.deepEqual(writes, ["PUT /api/account/self-data/views/my-tasks/my-tasks-home-dashboard"]);
});

// The adapter is one per source, shared by every block that shows it: a refused save
// is one event, so it says so once however many blocks are mounted.
test("a refused view save shows one error toast", async () => {
  state.clearSysSourceStateCache();
  useToastStore.getState().clear();
  const refusing = { ...transport("my-pages"), async put<T>(): Promise<T> { throw new Error("invalid_view"); } };
  const adapter = state.getSysDatabaseAdapter("sys:my-pages", refusing);
  const loaded = await adapter.loadState();
  const added = { ...loaded.views, "v-new": { ...Object.values(loaded.views)[0], id: "v-new", name: "Mine" } };
  adapter.persistState({ ...loaded, views: added }, loaded);
  await sleep();
  assert.deepEqual(useToastStore.getState().toasts.map((toast: { title: string }) => toast.title), ["Could not save this view: invalid_view"]);
});

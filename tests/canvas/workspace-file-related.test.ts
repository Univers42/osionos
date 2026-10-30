/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspace-file-related.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #162: a file's properties showed "Untitled" chips, repeated, that pointed at no page.
// The Files table's "Related" column was every relation of the page merged: row NAMES
// from database relations became page ids, and the column read back next to the
// relation it came from listed each id twice. An edit in the table then replaced
// every property of the page with the table's five facets.
// The page store and the user store do not load under node, so both are stubbed.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

import type { NotionState } from "@notion-db/object-database";
import type { PageEntry, PagePropertyEntry } from "../../src/entities/page/model/types.ts";

const STORE_STUB = `export const usePageStore = { getState: () => globalThis.__relatedStore };`;
const AUTH_STUB = `export const useUserStore = { getState: () => ({
  activeWorkspace: () => ({ _id: "ws" }), activeSession: () => ({ accessToken: "jwt" }) }) };`;
const url = (code: string): string => `data:text/javascript,${encodeURIComponent(code)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/store/usePageStore") return { url: url(STORE_STUB), shortCircuit: true };
    if (specifier === "@/features/auth") return { url: url(AUTH_STUB), shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { synthesizeWorkspaceState } = await import("../../src/widgets/database-view/model/workspaceDatabaseLoad.ts");
const { applyWorkspacePersist } = await import("../../src/widgets/database-view/model/workspaceDatabaseWrites.ts");
const { FILE } = await import("../../src/widgets/database-view/model/workspaceDatabaseConstants.ts");

const file = (id: string, properties: PagePropertyEntry[] = []): PageEntry => ({
  _id: id, title: id, workspaceId: "ws", properties, updatedAt: "2026-10-30T00:00:00.000Z",
} as PageEntry);

const relatedOf = (state: NotionState, id: string): unknown => state.pages[id]?.properties[FILE.related];

test("the Related column holds only page ids of live files, each once", () => {
  const state = synthesizeWorkspaceState([
    file("a", [
      { key: "rel", label: "See also", type: "relation", relationTarget: "page", value: ["b", "b", "gone", "c"] },
      // A record relation stores the related rows' NAMES, not page ids.
      { key: "rows", label: "Tasks", type: "relation", relationTarget: "database", value: ["Untitled", "Plan"] },
    ]),
    file("b"),
    file("c"),
  ]);
  assert.deepEqual(relatedOf(state, "a"), ["b", "c"]);
});

test("once the table wrote its own column, it is the only one read, so no id comes back twice", () => {
  const state = synthesizeWorkspaceState([
    file("a", [
      { key: "rel", label: "See also", type: "relation", value: ["b"] },
      { key: FILE.related, label: "Related", type: "relation", relationTarget: "page", value: ["b", "c"] },
    ]),
    file("b"),
    file("c"),
  ]);
  assert.deepEqual(relatedOf(state, "a"), ["b", "c"]);
});

test("an edit in the Files table keeps the page's own properties", () => {
  const own: PagePropertyEntry = { key: "due", label: "Due", type: "date", value: "2026-11-02" };
  const entry = file("a", [own]);
  const patches: Array<Partial<PageEntry>> = [];
  Reflect.set(globalThis, "__relatedStore", {
    pageById: (id: string) => (id === "a" ? entry : undefined),
    patchPage: (_id: string, patch: Partial<PageEntry>) => { patches.push(patch); },
    updatePageTitle: () => undefined,
    movePage: () => undefined,
  });
  const before = synthesizeWorkspaceState([entry]);
  const next = structuredClone(before);
  next.pages.a.properties[FILE.tags] = ["focus"];
  assert.equal(applyWorkspacePersist(next, before), true);
  const written = patches[0]?.properties ?? [];
  assert.deepEqual(written.find((property) => property.key === "due"), own);
  assert.deepEqual(written.find((property) => property.key === FILE.tags)?.value, ["focus"]);
});

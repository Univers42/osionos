/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-app-removals.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The page-file writer removes a file only for a page this tab's user removed in the app
// (store/appRemovals). These pin where the store records that intent: once the server has
// confirmed, for the ids it named (a big-folder cascade the server committed in part answers
// 5xx and records nothing), and a restore drops it (devil P1 requirements, 2026-10-14).
// The real actions run; the api client and the auth helpers read `import.meta.env`, which
// only Vite defines, so those two modules are stubbed, and the seed JSON gets its attribute.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const CLIENT_STUB = `
export const API_BASE = "";
export class ApiError extends Error {}
export function getActivePageJwt() { return "jwt"; }
export const api = { patch: (...args) => globalThis.__appRemovalsApi(...args), delete: (...args) => globalThis.__appRemovalsApi(...args) };
`;
const HELPERS_STUB = `export function pageApiJwtFromSessionToken(token) { return token; }`;
const url = (code: string): string => `data:text/javascript,${encodeURIComponent(code)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/shared/api/client") return { url: url(CLIENT_STUB), shortCircuit: true };
    const resolved = nextResolve(specifier, context);
    if (resolved.url.endsWith("/src/shared/api/client.ts")) return { url: url(CLIENT_STUB), shortCircuit: true };
    if (resolved.url.endsWith("/src/features/auth/model/userStore.helpers.ts")) return { url: url(HELPERS_STUB), shortCircuit: true };
    if (resolved.url.endsWith(".json")) return { ...resolved, importAttributes: { ...context.importAttributes, type: "json" }, shortCircuit: true };
    return resolved;
  },
});

const { createArchivePage, createDeletePage, createRestorePage } = await import("../../src/store/pageStore.actions.ts");
const { clearAppRemovals, forgetLiveAppRemovals, recordAppRemovals, takeAppRemoval } = await import("../../src/store/appRemovals.ts");
const { useToastStore } = await import("@osionos/ui/primitives/useToastStore");

const OWNER = "11111111-1111-4111-8111-111111111111";
const ROOT = "22222222-2222-4222-8222-222222222222";
const CHILD = "33333333-3333-4333-8333-333333333333";
const SESSION = { userId: OWNER, privateWorkspaces: [], sharedWorkspaces: [] };
Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({ activeSession: () => SESSION }),
  subscribe: () => () => undefined,
});

let workspaceSeq = 0;
const entry = (id: string, workspaceId: string, parentPageId: string | null) => ({
  _id: id, title: id.slice(0, 4), workspaceId, parentPageId, ownerId: OWNER, archivedAt: null,
  content: [], updatedAt: "2026-10-14T08:00:00.000Z",
});

/** A two-page tree in a fresh workspace, behind the minimal set/get the actions use. */
function tree() {
  const ws = `ws-app-removals-${(workspaceSeq += 1)}`;
  let state: Record<string, unknown> & { pages: Record<string, ReturnType<typeof entry>[]> } = {
    pages: { [ws]: [entry(ROOT, ws, null), entry(CHILD, ws, ROOT)] }, recents: [], activePage: null,
  };
  const get = () => ({ ...state, pageById: (id: string) => state.pages[ws].find((page) => page._id === id) });
  const set = (change: unknown) => {
    const next = typeof change === "function" ? (change as (s: typeof state) => object)(get() as typeof state) : change;
    state = { ...state, ...(next as object) };
  };
  return { ws, set: set as never, get: get as never, page: (id: string) => state.pages[ws].find((page) => page._id === id) };
}

const answer = (respond: () => Promise<unknown>): void => Reflect.set(globalThis, "__appRemovalsApi", respond);

test.beforeEach(() => useToastStore.getState().clear());

test("a confirmed archive records an intent for each id the server named, spent once", async () => {
  const t = tree();
  answer(async () => ({ cascadedIds: [ROOT, CHILD] }));
  await createArchivePage(t.set, t.get)(ROOT, t.ws, "jwt");
  assert.ok(t.page(CHILD)?.archivedAt, "the store applied the archive");
  assert.equal(takeAppRemoval(t.ws, CHILD), true);
  assert.equal(takeAppRemoval(t.ws, CHILD), false, "consumed once");
  assert.equal(takeAppRemoval(t.ws, ROOT), true);
});

test("P1: a cascade the server committed in part (5xx) records nothing and keeps the pages live", async () => {
  const t = tree();
  answer(async () => { throw new Error("BaaS request failed with 504"); });
  await createArchivePage(t.set, t.get)(ROOT, t.ws, "jwt");
  assert.equal(t.page(CHILD)?.archivedAt, null);
  assert.equal(takeAppRemoval(t.ws, ROOT), false);
  assert.equal(takeAppRemoval(t.ws, CHILD), false, "a later refetch showing the child archived finds no intent");
});

test("only the ids the server returned: a child it did not name gets no intent", async () => {
  const t = tree();
  answer(async () => ({ cascadedIds: [ROOT] }));
  await createArchivePage(t.set, t.get)(ROOT, t.ws, "jwt");
  assert.equal(takeAppRemoval(t.ws, CHILD), false);
  assert.equal(takeAppRemoval(t.ws, ROOT), true);
});

test("a confirmed delete records its ids; a confirmed restore drops them", async () => {
  const t = tree();
  answer(async () => ({ deletedIds: [ROOT, CHILD] }));
  await createDeletePage(t.set, t.get)(ROOT, t.ws, "jwt");
  assert.equal(takeAppRemoval(t.ws, ROOT), true);

  const r = tree();
  answer(async () => ({ cascadedIds: [ROOT, CHILD] }));
  await createArchivePage(r.set, r.get)(ROOT, r.ws, "jwt");
  answer(async () => ({ cascadedIds: [ROOT, CHILD] }));
  await createRestorePage(r.set, r.get)(ROOT, r.ws, "jwt");
  assert.equal(r.page(CHILD)?.archivedAt, null, "the store applied the restore");
  assert.equal(takeAppRemoval(r.ws, ROOT), false);
  assert.equal(takeAppRemoval(r.ws, CHILD), false);
});

test("an intent is dropped once its page is seen live again, and a starting writer clears them all", () => {
  recordAppRemovals("ws-live", [ROOT, CHILD]);
  forgetLiveAppRemovals("ws-live", (id) => id === ROOT);
  assert.equal(takeAppRemoval("ws-live", ROOT), false);
  recordAppRemovals("ws-live", [ROOT]);
  clearAppRemovals("ws-live");
  assert.equal(takeAppRemoval("ws-live", ROOT), false);
  assert.equal(takeAppRemoval("ws-live", CHILD), false);
});

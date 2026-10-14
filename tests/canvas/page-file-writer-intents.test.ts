/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-writer-intents.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The REAL usePageFileWriter hook and the REAL page-store actions, in one tab: the writer
// removes a file only in the tab that leads inbound AND for a page its user removed in the app
// (store/appRemovals). ST1: a stale second tab whose user trashed a folder the leader had just
// re-cloned removed the clone; I5 and I6: an intent the writer should have dropped authorised a
// later remove nobody asked for (devil D5 on 709fbea, 2026-10-14, its harness ported). P0 is
// the positive control: without it every "kept" below could pass vacuously.
// Stubbed, because only a browser or Vite provides them: React (an effect runs at once and its
// cleanup is kept), the api client, the auth helper, the sandbox provider (an in-memory one).
// HO-B and HO-C (devil D5-L7 on 7ca3090): a tab that GAINS the lead clears its intents and
// removes nothing until an attach that started after the gain has finished; the leading tabs
// below have attached (`tab(…, true)`), as a tab that loaded alone has.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const REACT_STUB = `
export function useSyncExternalStore(subscribe, getSnapshot) { return getSnapshot(); }
export function useEffect(effect) { const cleanup = effect(); (globalThis.__intentCleanups ??= []).push(cleanup); }
const noop = () => undefined;
export const useLayoutEffect = noop, useInsertionEffect = noop, useDebugValue = noop, useImperativeHandle = noop;
export const useCallback = (fn) => fn, useMemo = (fn) => fn(), useRef = (current) => ({ current });
export const useState = (v) => [typeof v === "function" ? v() : v, noop], useReducer = (r, v) => [v, noop];
export const useContext = (c) => c?._value, useId = () => "id", useTransition = () => [false, (f) => f()];
export const useDeferredValue = (v) => v, startTransition = (f) => f(), use = (v) => v;
export const createContext = (v) => ({ _value: v, Provider: noop, Consumer: noop });
export const forwardRef = (c) => c, memo = (c) => c, lazy = (f) => f, createElement = () => null, cloneElement = (e) => e;
export const isValidElement = () => false, Children = { map: noop, forEach: noop, count: () => 0, toArray: () => [], only: noop };
export const Fragment = "Fragment", StrictMode = "StrictMode", Suspense = "Suspense";
export class Component {}
export class PureComponent {}
const React = { useSyncExternalStore, useEffect, useLayoutEffect, useInsertionEffect, useDebugValue, useImperativeHandle,
  useCallback, useMemo, useRef, useState, useReducer, useContext, useId, useTransition, useDeferredValue, startTransition, use,
  createContext, forwardRef, memo, lazy, createElement, cloneElement, isValidElement, Children, Fragment, StrictMode, Suspense,
  Component, PureComponent };
export default React;
export const jsx = () => null, jsxs = () => null, jsxDEV = () => null;
`;
const CLIENT_STUB = `
export const API_BASE = "";
export class ApiError extends Error {}
export function getActivePageJwt() { return "jwt"; }
export function getActiveJwt() { return "jwt"; }
export const api = { get: (...a) => globalThis.__intentApi(...a), post: (...a) => globalThis.__intentApi(...a),
  patch: (...a) => globalThis.__intentApi(...a), delete: (...a) => globalThis.__intentApi(...a) };
`;
const BY_SUFFIX: [string, string][] = [
  ["/src/shared/api/client.ts", CLIENT_STUB],
  ["/src/features/auth/model/userStore.helpers.ts", "export function pageApiJwtFromSessionToken(token) { return token; }"],
  ["/src/features/ide/vfs/sandboxProvider.ts", "export function createSandboxProvider() { return globalThis.__intentProvider; }"],
  ["/src/features/ide/vfs/bridgeTransport.ts", "export function bridgeFsTransport() { return {}; }"],
];
const url = (code: string): string => `data:text/javascript,${encodeURIComponent(code)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (["react", "react/jsx-runtime", "react/jsx-dev-runtime"].includes(specifier)) return { url: url(REACT_STUB), shortCircuit: true };
    const resolved = nextResolve(specifier, context);
    for (const [suffix, code] of BY_SUFFIX) if (resolved.url.endsWith(suffix)) return { url: url(code), shortCircuit: true };
    if (resolved.url.endsWith(".json")) return { ...resolved, importAttributes: { ...context.importAttributes, type: "json" }, shortCircuit: true };
    return resolved;
  },
});

const { usePageStore } = await import("../../src/store/usePageStore.ts");
const { derivePageState } = await import("../../src/store/pageStore.helpers.ts");
const { takeAppRemoval } = await import("../../src/store/appRemovals.ts");
const { useSandboxHealthStore } = await import("../../src/features/ide/model/sandboxHealthStore.ts");
const { useIdeOutputBus } = await import("../../src/features/ide/model/ideOutputBus.ts");
const { acquireInboundLeadership, attachUnderLead, createSerialQueue } = await import("../../src/features/ide/model/inboundPipeline.ts");
const { createLiveInbound } = await import("../../src/features/ide/model/inboundLive.ts");
const { createMemProvider } = await import("../../src/features/ide/vfs/memProvider.ts");
const { buildVPath } = await import("../../src/features/ide/vfs/vpath.ts");
const { usePageFileWriter, WRITE_DEBOUNCE_MS } = await import("../../src/features/page-file/model/usePageFileWriter.ts");
const { pageIndexFor } = await import("../../src/features/page-file/model/pageIndexCache.ts");
const { page } = await import("./page-file-facade-fixtures.ts");
const { createFakeLocks } = await import("./fixtures/fakeLocks.ts");

const OWNER = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";
const X = "33333333-3333-4333-8333-333333333333";
const workspaces: string[] = [];
Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({ activeSession: () => ({ userId: OWNER, privateWorkspaces: workspaces.map((_id) => ({ _id })), sharedWorkspaces: [] }) }),
  subscribe: () => () => undefined,
});
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const round = () => sleep(WRITE_DEBOUNCE_MS + 400);
let seq = 0;

type Entry = ReturnType<typeof page>;

/** One tab on a fresh workspace holding `entries`; `leads` says whether it applies shell events. */
async function tab(entries: Entry[], leads: boolean) {
  const ws = `ws-intents-${(seq += 1)}`;
  workspaces.push(ws);
  const { locks } = createFakeLocks();
  let otherTabCloses = (): void => {};
  if (!leads) void locks.request(`osio-inbound:${ws}`, { mode: "exclusive" }, () => new Promise<void>((resolve) => { otherTabCloses = resolve; }));
  const leadership = acquireInboundLeadership(ws, locks);
  await sleep(0);
  if (leads) attachUnderLead(ws)(); // the attach a tab that loaded alone has run
  const provider = createMemProvider("sandbox");
  Reflect.set(globalThis, "__intentProvider", provider);
  useSandboxHealthStore.setState({ state: "online" });
  const own = (entry: Entry): Entry => ({ ...entry, workspaceId: ws, ownerId: OWNER, updatedAt: "2026-10-14T08:00:00.000Z" }) as Entry;
  const put = (list: Entry[]) => usePageStore.setState((state: never) => derivePageState({ ...(state as { pages: object }).pages, [ws]: list }, state));
  put(entries.map(own));
  const pages = (): Entry[] => usePageStore.getState().pages[ws] ?? [];
  const patch = (id: string, change: Partial<Entry>) => put(pages().map((entry) => (entry._id === id ? { ...entry, ...change } : entry)));
  const store = usePageStore.getState();
  return {
    ws, pages, patch,
    pathOf: (id: string) => pageIndexFor(ws, pages().filter((entry) => !entry.archivedAt)).pathForId(id) as string,
    present: (path: string) => provider.read(buildVPath("sandbox", ws, path.split("/"))).then(() => true, () => false),
    start: (): (() => void) => {
      usePageFileWriter(ws, true);
      return (Reflect.get(globalThis, "__intentCleanups") as (() => void)[]).pop() ?? (() => undefined);
    },
    answer: (body: unknown) => Reflect.set(globalThis, "__intentApi", async () => body),
    archive: (id: string) => store.archivePage(id, ws, "jwt"),
    restore: (id: string) => store.restorePage(id, ws, "jwt"),
    /** The leading tab closes; this tab takes the lead at the next tick. */
    leaderCloses: async () => { otherTabCloses(); await sleep(0); },
    close: () => { leadership.release(); otherTabCloses(); },
  };
}

/** X under folder P, X's file written and agreed by the writer itself. */
async function synced(t: Awaited<ReturnType<typeof tab>>) {
  const stop = t.start();
  t.patch(X, { content: [{ id: "b-x", type: "paragraph", content: "cloned bytes" }] as never });
  await round();
  const path = t.pathOf(X);
  assert.equal(await t.present(path), true, "setup: the writer wrote X's file");
  return { stop, path };
}
const tree = () => [page(P, "proj", null, "folder"), page(X, "child", P, "page", [{ id: "b-x", type: "paragraph", content: "x" }] as never)];

test("P0 control: the leading tab's user trashes X in the app; the writer removes X's file", async () => {
  const t = await tab(tree(), true);
  const { stop, path } = await synced(t);
  t.answer({ ok: true, cascadedIds: [] });
  await t.archive(X);
  await round();
  stop();
  t.close();
  assert.equal(await t.present(path), false, "the user's own removal must still remove");
});

test("ST1: a tab that does not lead trashes the folder a re-clone replaced; the clone stays and the intent is spent", async () => {
  const t = await tab(tree(), false);
  const { stop, path } = await synced(t);
  // The leader ran `rm -rf proj && git clone`: the server holds P and X archived and a new page owns
  // `path` with the same bytes. This tab has not refetched, and the server's cascade names X anyway.
  t.answer({ ok: true, updatedAt: "2026-10-14T10:00:00.000Z", cascadedIds: [X] });
  await t.archive(P);
  await round();
  stop();
  t.close();
  assert.equal(await t.present(path), true, "the re-cloned file was removed by a tab that does not lead");
  assert.equal(takeAppRemoval(t.ws, X), false, "the intent was not spent");
  assert.ok(useIdeOutputBus.getState().lines.some((line) => /left without a page/.test(line.text)), "Output does not count it");
});

test("I5: an intent whose page a round sees live again cannot authorise a later archive from elsewhere", async () => {
  const t = await tab(tree(), true);
  const { stop, path } = await synced(t);
  t.answer({ ok: true, cascadedIds: [] });
  await t.archive(X);
  t.patch(X, { archivedAt: null }); // within the debounce: restored on another device, refetched here
  await round(); // the round sees X live
  t.patch(X, { archivedAt: "2026-10-14T10:05:00.000Z" }); // archived on another device: no intent here
  await round();
  stop();
  t.close();
  assert.equal(await t.present(path), true, "a stale intent removed a file the user's last word did not");
});

test("I6: an intent recorded while the writer was off cannot authorise a later archive from elsewhere", async () => {
  const t = await tab(tree(), true);
  const { stop, path } = await synced(t);
  stop(); // sandbox health flap: the writer is off
  t.answer({ ok: true, cascadedIds: [] });
  await t.archive(X);
  t.patch(X, { archivedAt: null }); // restored on another device, refetched; no round sees it
  const restart = t.start(); // health back: the baseline has X live
  t.patch(X, { archivedAt: "2026-10-14T10:05:00.000Z" }); // archived on another device before the first round
  await round();
  restart();
  t.close();
  assert.equal(await t.present(path), true, "an intent from before the writer started removed the file");
});

test("I10: archive, restore, archive again in the leading tab removes each time; a restore leaves no intent", async () => {
  const t = await tab(tree(), true);
  const { stop, path } = await synced(t);
  t.answer({ ok: true, cascadedIds: [] });
  await t.archive(X);
  await round();
  assert.equal(await t.present(path), false, "the first archive removes");
  t.answer({ ok: true, cascadedIds: [] });
  await t.restore(X);
  await round();
  assert.equal(await t.present(path), true, "the restore writes the file back");
  assert.equal(takeAppRemoval(t.ws, X), false, "an intent survived the restore");
  t.answer({ ok: true, cascadedIds: [X] });
  await t.archive(P); // the cascade names X, live here: a real removal of X
  await round();
  stop();
  t.close();
  assert.equal(await t.present(path), false, "the second archive, through the folder, removes again");
});

test("HO-B: a stale tab takes the lead when the leader closes, then trashes the old folder; the clone stays", async () => {
  const t = await tab(tree(), false);
  const { stop, path } = await synced(t);
  await t.leaderCloses();
  t.answer({ ok: true, updatedAt: "2026-10-14T10:00:00.000Z", cascadedIds: [X] });
  await t.archive(P);
  await round();
  stop();
  t.close();
  assert.equal(await t.present(path), true, "a successor that had not attached removed the re-cloned file");
  assert.equal(takeAppRemoval(t.ws, X), false, "the intent was not spent");
});

test("HO-C: a follower trashes, and the leader closes inside the writer's debounce; the clone stays", async () => {
  const t = await tab(tree(), false);
  const { stop, path } = await synced(t);
  t.answer({ ok: true, updatedAt: "2026-10-14T10:00:00.000Z", cascadedIds: [X] });
  await t.archive(P);
  await t.leaderCloses(); // the gain clears the follower's intents
  assert.equal(takeAppRemoval(t.ws, X), false, "the gain kept a follower's intent");
  await round();
  stop();
  t.close();
  assert.equal(await t.present(path), true, "a follower's intent removed the clone after the handover");
});

test("L7 control: once the new leader has attached, its user's own trash removes again", async () => {
  const t = await tab(tree(), false);
  const { stop, path } = await synced(t);
  await t.leaderCloses();
  attachUnderLead(t.ws)(); // the attach the gain queued: pages pulled, tree reconciled
  t.answer({ ok: true, cascadedIds: [] });
  await t.archive(X);
  await round();
  stop();
  t.close();
  assert.equal(await t.present(path), false, "a settled leader must remove what its user trashed");
});

test("L7: an attach that started before the gain does not open removals", async () => {
  const t = await tab(tree(), false);
  const { stop, path } = await synced(t);
  const settled = attachUnderLead(t.ws); // started while following
  await t.leaderCloses();
  settled();
  t.answer({ ok: true, cascadedIds: [] });
  await t.archive(X);
  await round();
  stop();
  t.close();
  assert.equal(await t.present(path), true, "an attach from before the takeover counted");
});

/** The attach a gain queues (inboundLive), the page list answered by `pages` (a throw: the pull fails). */
async function liveAttach(t: Awaited<ReturnType<typeof tab>>, pages: () => unknown) {
  const archive = { ok: true, cascadedIds: [] };
  Reflect.set(globalThis, "__intentApi", async (path: string) => (String(path).startsWith("/api/pages/all") ? pages() : archive));
  await createLiveInbound(t.ws, createSerialQueue(() => undefined)).attach();
}

test("L7 live: the attach a gain queues pulls the pages, and only then may the new leader remove", async () => {
  const t = await tab(tree(), false);
  const { stop, path } = await synced(t);
  await t.leaderCloses();
  await liveAttach(t, () => t.pages());
  await t.archive(X);
  await round();
  stop();
  t.close();
  assert.equal(await t.present(path), false, "a leader that pulled and attached must remove what its user trashed");
});

test("L7 live: an attach whose page pull failed leaves the new leader unable to remove", async () => {
  const t = await tab(tree(), false);
  const { stop, path } = await synced(t);
  await t.leaderCloses();
  await liveAttach(t, () => { throw new Error("BaaS request failed with 503"); });
  await t.archive(X);
  await round();
  stop();
  t.close();
  assert.equal(await t.present(path), true, "an attach on a page list it could not pull opened removals");
});

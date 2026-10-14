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
// A2 (attach lane, 2026-10-14): an attach whose server pull did not land reconciles NOTHING
// into the sandbox — the localStorage cache is never written over the sandbox — says so on
// Output (ATTACH_DEFERRED) and is re-queued on a 5 s/15 s/30 s/60 s backoff until it lands.
// A pull that landed is a 200 whose body WAS a page list: a 200 answering anything else merged
// nothing (R4), so it defers too. The retry only runs while the tab still leads the workspace
// (R3) and only if the sync effect is still mounted (R2): a retry whose timer fired before
// dispose is still queued behind the task in front of it, and must touch nothing.
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
const { acquireInboundLeadership, attachUnderLead, createSerialQueue, removesForItsUser } = await import("../../src/features/ide/model/inboundPipeline.ts");
const { createLiveInbound, ATTACH_DEFERRED } = await import("../../src/features/ide/model/inboundLive.ts");
const { createMemProvider } = await import("../../src/features/ide/vfs/memProvider.ts");
const { buildVPath } = await import("../../src/features/ide/vfs/vpath.ts");
const { usePageFileWriter, WRITE_DEBOUNCE_MS } = await import("../../src/features/page-file/model/usePageFileWriter.ts");
const { pageIndexFor } = await import("../../src/features/page-file/model/pageIndexCache.ts");
const { bytesToText, collectBytes } = await import("../../src/features/ide/vfs/bytes.ts");
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
  let writes = 0;
  const write = provider.write.bind(provider);
  provider.write = (path, data, opts) => { writes += 1; return write(path, data, opts); };
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
    /** Sandbox writes since the tab was made; the attach's are what the A2 tests count. */
    writes: () => writes,
    /** The shell removing a file, with no page-store change: only a reconcile brings it back. */
    drop: (path: string) => provider.delete(buildVPath("sandbox", ws, path.split("/"))),
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
const CODE_TEXT = "int main(){return 0;}";
const treeCode = () => [page(P, "proj", null, "folder"), page(X, "make.c", P, "code", [{ id: "b-x", type: "code", content: CODE_TEXT }] as never)];

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

/** The attach a gain queues (inboundLive), the page list answered by `pages` (a throw: the pull
 *  fails). Disposed after the attach, as the sync effect's cleanup would be: on the failed pull
 *  that cancels the A2 retry, so no timer outlives the test. */
async function liveAttach(t: Awaited<ReturnType<typeof tab>>, pages: () => unknown) {
  const archive = { ok: true, cascadedIds: [] };
  Reflect.set(globalThis, "__intentApi", async (path: string) => (String(path).startsWith("/api/pages/all") ? pages() : archive));
  const live = createLiveInbound(t.ws, createSerialQueue(() => undefined));
  await live.attach();
  live.session.dispose();
}

/** The api router the A2 tests count: `pull(call)` answers each `/api/pages/all` (a throw is a
 *  failed pull), everything else gets the archive stub. Returns the call counter. O(1). */
function countedPull(pull: (call: number) => unknown): () => number {
  const archive = { ok: true, cascadedIds: [] };
  let calls = 0;
  Reflect.set(globalThis, "__intentApi", async (path: string) => {
    if (!String(path).startsWith("/api/pages/all")) return archive;
    calls += 1;
    return pull(calls);
  });
  return () => calls;
}

test("A2: an attach whose page pull never landed writes nothing to the sandbox and says so", async () => {
  const t = await tab(tree(), false);
  const { stop, path } = await synced(t);
  await t.leaderCloses();
  await t.drop(path); // the shell removed X's file: a reconciled attach would write it back
  countedPull(() => { throw new Error("BaaS request failed with 503"); });
  const live = createLiveInbound(t.ws, createSerialQueue(() => undefined));
  const before = t.writes();
  try {
    await live.attach();
    assert.equal(t.writes() - before, 0, "an attach whose pull failed wrote to the sandbox");
    assert.ok(
      useIdeOutputBus.getState().lines.some((line) => line.channel === "fs-sync" && line.text === ATTACH_DEFERRED),
      "Output does not say the reconcile was deferred",
    );
    assert.equal(removesForItsUser(t.ws), false, "the deferred attach opened removals");
  } finally {
    live.session.dispose();
    stop();
    t.close();
  }
});

test("A2: the retry's pull lands, and it reconciles the file and settles", async (ctx) => {
  const t = await tab(tree(), false);
  const { stop, path } = await synced(t);
  await t.leaderCloses();
  await t.drop(path);
  const pulls = countedPull((call) => {
    if (call === 1) throw new Error("BaaS request failed with 503");
    return t.pages();
  });
  const queue = createSerialQueue(() => undefined);
  const live = createLiveInbound(t.ws, queue);
  ctx.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await live.attach();
    assert.equal(await t.present(path), false, "setup: the deferred attach wrote the dropped file");
    ctx.mock.timers.tick(5_000);
    await queue.idle();
    assert.equal(pulls(), 2, "the retry did not ask the server again");
    assert.equal(await t.present(path), true, "the retry did not reconcile the shell's removal");
    assert.equal(removesForItsUser(t.ws), true, "the retry's attach did not settle");
  } finally {
    live.session.dispose();
    ctx.mock.timers.reset();
    stop();
    t.close();
  }
});

test("A2: disposal before the retry stops the schedule — no further page pull", async (ctx) => {
  const t = await tab(tree(), false);
  const { stop } = await synced(t);
  await t.leaderCloses();
  const pulls = countedPull(() => { throw new Error("BaaS request failed with 503"); });
  const queue = createSerialQueue(() => undefined);
  const live = createLiveInbound(t.ws, queue);
  ctx.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await live.attach();
    assert.equal(pulls(), 1, "setup: the attach pulled once");
    live.session.dispose();
    for (const step of [5_000, 15_000, 30_000, 60_000]) ctx.mock.timers.tick(step);
    await queue.idle();
    assert.equal(pulls(), 1, "a disposed effect still pulled the pages");
  } finally {
    ctx.mock.timers.reset();
    stop();
    t.close();
  }
});

test("A2: a retry queued before the effect was disposed pulls nothing and writes nothing", async () => {
  const t = await tab(tree(), false);
  const { stop } = await synced(t);
  const pulls = countedPull(() => { throw new Error("BaaS request failed with 503"); });
  const queue = createSerialQueue(() => undefined);
  const live = createLiveInbound(t.ws, queue);
  const lines = () => useIdeOutputBus.getState().lines.length;
  const seen = { lines: lines(), writes: t.writes() };
  let release = (): void => undefined;
  const busy = new Promise<void>((resolve) => { release = resolve; });
  const inFront = queue.run(async () => { await busy; });
  const queued = queue.run(() => live.attach()); // the retry's place once its timer fired
  live.session.dispose(); // the sync effect's cleanup, while this attach still waits
  release();
  await Promise.all([inFront, queued]);
  assert.equal(pulls(), 0, "a disposed session still pulled the pages");
  assert.equal(t.writes() - seen.writes, 0, "a disposed session still wrote to the sandbox");
  assert.equal(lines(), seen.lines, "a disposed session still wrote an Output line");
  stop();
  t.close();
});

test("A2: a retry that fires after the lead was released is dropped, not queued", async (ctx) => {
  const t = await tab(tree(), false);
  const { stop } = await synced(t);
  await t.leaderCloses(); // this tab leads now: only its attach may reconcile the tree
  const pulls = countedPull(() => { throw new Error("BaaS request failed with 503"); });
  const queue = createSerialQueue(() => undefined);
  const live = createLiveInbound(t.ws, queue);
  ctx.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await live.attach();
    assert.equal(pulls(), 1, "setup: the leading attach pulled once and deferred");
    t.close(); // the lead is released: another tab applies the tree now
    ctx.mock.timers.tick(5_000);
    await queue.idle();
    assert.equal(pulls(), 1, "a retry from a tab that no longer leads pulled the pages again");
  } finally {
    live.session.dispose();
    ctx.mock.timers.reset();
    stop();
    t.close();
  }
});

test("A2: a 200 whose body is not a page list is not a pull: the attach defers and writes nothing", async () => {
  const t = await tab(tree(), false);
  const { stop, path } = await synced(t);
  await t.leaderCloses();
  await t.drop(path); // the shell removed X's file: a reconciled attach would write it back
  const pulls = countedPull(() => ({})); // 200, but no page array: nothing was merged
  const live = createLiveInbound(t.ws, createSerialQueue(() => undefined));
  const deferred = () => useIdeOutputBus.getState().lines.filter((line) => line.channel === "fs-sync" && line.text === ATTACH_DEFERRED).length;
  const seen = { writes: t.writes(), deferred: deferred() };
  try {
    await live.attach();
    assert.equal(pulls(), 1, "the attach did not ask the server once more");
    assert.equal(t.writes() - seen.writes, 0, "the sandbox was written from the localStorage cache");
    assert.equal(deferred(), seen.deferred + 1, "Output does not say the reconcile was deferred");
  } finally {
    live.session.dispose();
    stop();
    t.close();
  }
});

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

test("code twin of I10: archive removes the code file, restore writes it back with the code text", async () => {
  const t = await tab(treeCode(), true);
  const stop = t.start();
  const provider = Reflect.get(globalThis, "__intentProvider") as { read: (v: unknown) => Promise<ReadableStream<Uint8Array> | Uint8Array> };
  const readText = async (path: string): Promise<string | null> => {
    try {
      return bytesToText(await collectBytes(await provider.read(buildVPath("sandbox", t.ws, path.split("/")))));
    } catch {
      return null;
    }
  };
  t.answer({ ok: true, cascadedIds: [] });
  await t.archive(X);
  await round();
  t.answer({ ok: true, cascadedIds: [] });
  await t.restore(X);
  await round();
  const path = t.pathOf(X);
  assert.equal(await t.present(path), true, "setup: the restore wrote X's file");
  assert.equal(await readText(path), CODE_TEXT, "setup: the file holds X's code");
  t.answer({ ok: true, cascadedIds: [] });
  await t.archive(X);
  await round();
  assert.equal(await t.present(path), false, "the archive removes the code file");
  t.answer({ ok: true, cascadedIds: [] });
  await t.restore(X);
  await round();
  assert.equal(await t.present(path), true, "the restore writes the file back");
  assert.equal(await readText(path), CODE_TEXT, "the restored file holds X's code text");
  stop();
  t.close();
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   top-bar-search-archived.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

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
const USER_STORE_STUB = `
export const useUserStore = {
  getState: () => ({
    activeWorkspace: () => ({ _id: "ws-test" }),
    activeSession: () => ({ userId: "user-1", privateWorkspaces: [{ _id: "ws-test" }], sharedWorkspaces: [] }),
  }),
  subscribe: () => () => undefined,
};
`;
const AUTH_INDEX_STUB = `
export const useUserStore = {
  getState: () => ({
    activeWorkspace: () => ({ _id: "ws-test" }),
    activeSession: () => ({ userId: "user-1", privateWorkspaces: [{ _id: "ws-test" }], sharedWorkspaces: [] }),
  }),
  subscribe: () => () => undefined,
};
export const useIsAdmin = () => false;
`;
const BY_SUFFIX: [string, string][] = [
  ["/src/shared/api/client.ts", CLIENT_STUB],
  ["/src/features/auth/model/useUserStore.ts", USER_STORE_STUB],
  ["/src/features/auth/index.ts", AUTH_INDEX_STUB],
  ["/src/features/auth/model/userStore.helpers.ts", "export function pageApiJwtFromSessionToken(token) { return token; }"],
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

// Set up the playground user store for page access context (required by canEditPage)
Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({
    activeSession: () => ({ userId: "user-1", privateWorkspaces: [{ _id: "ws-test" }], sharedWorkspaces: [] }),
  }),
  subscribe: () => () => undefined,
});

const { withoutArchived } = await import("../../src/widgets/top-bar/model/search.ts");
import type { PaletteResult } from "../../src/widgets/top-bar/model/search.ts";
const { usePageStore } = await import("../../src/store/usePageStore.ts");
const { derivePageState } = await import("../../src/store/pageStore.helpers.ts");

const PAGE_A = { _id: "page-a", title: "Page A", workspaceId: "ws-test", archivedAt: null, ownerId: "user-1" };
const PAGE_B = { _id: "page-b", title: "Page B", workspaceId: "ws-test", archivedAt: null, ownerId: "user-1" };
const PAGE_C = { _id: "page-c", title: "Page C", workspaceId: "ws-test", archivedAt: null, ownerId: "user-1" };

function makePageResult(id: string, title: string): PaletteResult {
  return { id, title, kind: "page", run: () => {} };
}
function makeCommandResult(id: string, title: string): PaletteResult {
  return { id, title, kind: "command", run: () => {} };
}
function makePersonResult(id: string, title: string): PaletteResult {
  return { id: `person:${id}`, title, kind: "person", run: () => {} };
}
function makeMessageResult(id: string, title: string): PaletteResult {
  return { id: `message:${id}`, title, kind: "message", run: () => {} };
}

test("withoutArchived: an archived page row is dropped", () => {
  const rows: PaletteResult[] = [
    makePageResult("page-a", "Page A"),
    makePageResult("page-b", "Page B"),
  ];
  const archived = (id: string) => id === "page-b";
  const filtered = withoutArchived(rows, archived);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "page-a");
});

test("withoutArchived: a live page row is kept", () => {
  const rows: PaletteResult[] = [makePageResult("page-a", "Page A")];
  const archived = (id: string) => id === "page-b";
  const filtered = withoutArchived(rows, archived);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "page-a");
});

test("withoutArchived: a non-page row (command) is kept", () => {
  const rows: PaletteResult[] = [makeCommandResult("cmd-1", "Command")];
  const archived = (id: string) => true; // everything archived
  const filtered = withoutArchived(rows, archived);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].kind, "command");
});

test("withoutArchived: a non-page row (person) is kept", () => {
  const rows: PaletteResult[] = [makePersonResult("user-1", "Person")];
  const archived = (id: string) => true;
  const filtered = withoutArchived(rows, archived);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].kind, "person");
});

test("withoutArchived: a non-page row (message) is kept", () => {
  const rows: PaletteResult[] = [makeMessageResult("msg-1", "Message")];
  const archived = (id: string) => true;
  const filtered = withoutArchived(rows, archived);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].kind, "message");
});

test("through the real page store: a page present then archived with archivePage is dropped from a remote row list that still contains it", async () => {
  // Set up a fresh page store with three pages
  const ws = "ws-test";
  const initialPages = [
    { ...PAGE_A, _id: "page-a" },
    { ...PAGE_B, _id: "page-b", archivedAt: null }, // starts live
    { ...PAGE_C, _id: "page-c" },
  ];
  usePageStore.setState((state: never) => derivePageState({ ...(state as { pages: object }).pages, [ws]: initialPages }, state));

  // Remote rows simulating a server response that still includes all three pages
  const remoteRows: PaletteResult[] = [
    makePageResult("page-a", "Page A"),
    makePageResult("page-b", "Page B"),
    makePageResult("page-c", "Page C"),
  ];

  // Initially page-b is live, so all three should pass through
  let archived = (id: string) => {
    const page = usePageStore.getState().pageById(id);
    return page?.archivedAt != null;
  };
  let filtered = withoutArchived(remoteRows, archived);
  assert.equal(filtered.length, 3, "all three pages live initially");

  // Archive page-b via the real store action (stub the api call)
  // cascadeIdsFrom expects cascadedIds to be descendants ONLY (root excluded)
  const origApi = globalThis.__intentApi;
  globalThis.__intentApi = async () => ({ ok: true, cascadedIds: [] });
  await usePageStore.getState().archivePage("page-b", ws, "jwt");
  globalThis.__intentApi = origApi;

  // Now page-b should be archived and filtered out
  archived = (id: string) => {
    const page = usePageStore.getState().pageById(id);
    return page?.archivedAt != null;
  };
  filtered = withoutArchived(remoteRows, archived);
  assert.equal(filtered.length, 2, "page-b archived and dropped");
  assert.equal(filtered.find((r) => r.id === "page-b"), undefined);
  assert.ok(filtered.find((r) => r.id === "page-a"));
  assert.ok(filtered.find((r) => r.id === "page-c"));
});
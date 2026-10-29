/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   social-store-hydrate.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Several rows mount useConnections at once, and each calls hydrate() on the
// blocks, reports and contacts stores. The stores must send one request for
// the burst and must not toast a failed load: the panels show it inline.

import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

const calls = { blocks: 0, reports: 0, contacts: 0, toasts: 0, fail: false };
globalThis.__hydrateCalls = calls;
// zustand persist reads window.localStorage.
globalThis.window = globalThis;
const memory = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) } });

const stub = (source) => ({ url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true });
const apiStub = (key, name) =>
  `export const ${name} = async () => { const c = globalThis.__hydrateCalls; c.${key}++; await new Promise((r) => setTimeout(r, 5)); if (c.fail) throw new Error('boom'); return []; };`;
const STUBS = {
  "@/shared/ui": `export const useToastStore = { getState: () => ({ push() { globalThis.__hydrateCalls.toasts++; } }) };`,
  "@/shared/api/client": `export const API_BASE = 'http://x'; export const api = {}; export class ApiError extends Error {}; export const getActivePageJwt = () => null;`,
  "@/shared/social/blockApi": `${apiStub("blocks", "listBlocks")} export const blockUser = async () => null; export const unblockUser = async () => {};`,
  "@/shared/social/reportApi": `${apiStub("reports", "listReports")} export const submitReport = async () => null;`,
  "@/shared/social/connectionApi": `${apiStub("contacts", "listConnections")} export const createConnection = async () => null; export const removeConnection = async () => {}; export const transitionConnection = async () => null;`,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    return STUBS[specifier] ? stub(STUBS[specifier]) : nextResolve(specifier, context);
  },
});

const { useBlocksStore } = await import("@/store/social/useBlocksStore");
const { useReportsStore } = await import("@/store/social/useReportsStore");
const { useContactsStore } = await import("@/store/social/useContactsStore");

const STORES = [
  ["blocks", useBlocksStore],
  ["reports", useReportsStore],
  ["contacts", useContactsStore],
];

for (const [key, store] of STORES) {
  test(`${key}: concurrent hydrates send one request`, async () => {
    calls[key] = 0;
    calls.fail = false;
    await Promise.all([store.getState().hydrate(), store.getState().hydrate(), store.getState().hydrate()]);
    assert.equal(calls[key], 1);
    await store.getState().hydrate();
    assert.equal(calls[key], 2, "a later hydrate is a new request");
  });

  test(`${key}: a failed hydrate sets error and raises no toast`, async () => {
    calls.toasts = 0;
    calls.fail = true;
    await Promise.all([store.getState().hydrate(), store.getState().hydrate()]);
    assert.equal(store.getState().error, "boom");
    assert.equal(calls.toasts, 0);
    assert.equal(store.getState().loading, false);
  });
}

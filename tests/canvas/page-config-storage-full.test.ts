/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-config-storage-full.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ADR 0056 A6: page settings are user content. On a full origin the last attempt makes room
// from the page caches, and a write still refused is shown, never dropped in silence.

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { QuotaStorage } from "./quota-storage.ts";

const storage = new QuotaStorage();
Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: storage });

const { usePageConfigStore } = await import("../../src/shared/config/pageConfigStore.ts");
const { useToastStore } = await import("@osionos/ui/primitives/useToastStore");

const KEY = "osionos:page-configurations";
const PAGE_CACHE = "osio:pages:ws-cache";
const notices = () => useToastStore.getState().toasts.filter((toast) => toast.title === "Browser storage is full");

beforeEach(() => {
  storage.clear();
  useToastStore.getState().clear();
});

test("A6 page settings refused at every attempt stay in memory and show the storage-full notice", async () => {
  storage.refused.add(KEY);
  await usePageConfigStore.getState().updateConfig("u1", "p1", { fullWidth: true });
  assert.equal(usePageConfigStore.getState().getConfig("u1", "p1").fullWidth, true);
  assert.equal(storage.getItem(KEY), null);
  assert.equal(notices().length, 1);
});

test("A6 the last attempt for page settings makes room from the page caches", async () => {
  storage.setItem(PAGE_CACHE, "x".repeat(64));
  storage.fullWhilePageCached.add(KEY);
  await usePageConfigStore.getState().updateConfig("u1", "p2", { smallText: true });
  assert.equal(storage.getItem(PAGE_CACHE), null);
  assert.equal(JSON.parse(storage.getItem(KEY) ?? "{}").state.configs["u1:p2"].smallText, true);
  assert.equal(notices().length, 0);
});

test("A6 version snapshots are shed before any page cache is evicted", () => {
  storage.setItem(PAGE_CACHE, "x");
  storage.refusals.set(KEY, 1);
  const versions = Array.from({ length: 5 }, (_, index) => ({ id: `v${index}` }));
  usePageConfigStore.setState({ configs: { "u1:p3": { versions } as never } });
  assert.equal(JSON.parse(storage.getItem(KEY) ?? "{}").state.configs["u1:p3"].versions.length, 3);
  assert.equal(storage.getItem(PAGE_CACHE), "x");
  assert.equal(notices().length, 0);
});

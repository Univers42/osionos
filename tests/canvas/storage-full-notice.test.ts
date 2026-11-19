/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   storage-full-notice.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ADR 0056 A5: a write a full origin refuses never throws into its caller, and the user hears
// about it once per store per session, through the one storage-full notice.

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { QuotaStorage } from "./quota-storage.ts";

const storage = new QuotaStorage();
Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: storage });

const { noticingJsonStorage, noticingWriter, trySetItem } = await import("../../src/shared/lib/storage-full/noticingWrite.ts");
const { useToastStore } = await import("@osionos/ui/primitives/useToastStore");

const notices = () => useToastStore.getState().toasts.filter((toast) => toast.title === "Browser storage is full");

beforeEach(() => {
  storage.clear();
  useToastStore.getState().clear();
});

test("A5 trySetItem reports a refused write instead of throwing", () => {
  storage.refused.add("k");
  assert.equal(trySetItem("k", "v"), false);
  assert.equal(trySetItem("other", "v"), true);
  assert.equal(storage.getItem("other"), "v");
  assert.equal(trySetItem("k", "v", undefined), false);
});

test("A5 a refused write shows the notice once per store per session, naming the store", () => {
  storage.refused.add("k");
  const recents = noticingWriter("Recent pages");
  assert.equal(recents("k", "1"), false);
  assert.equal(recents("k", "2"), false);
  assert.equal(noticingWriter("Recent pages")("k", "3"), false);
  assert.equal(notices().length, 1);
  assert.match(notices()[0].description ?? "", /^Recent pages: /);
  noticingWriter("Sidebar layout")("k", "1");
  assert.deepEqual(notices().map((toast) => toast.description?.split(":")[0]), ["Recent pages", "Sidebar layout"]);
});

test("A5 a kept write and a missing storage show no notice", () => {
  assert.equal(noticingWriter("Kept store")("k", "v"), true);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: undefined });
  try {
    assert.equal(noticingWriter("No storage store")("k", "v"), false);
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: storage });
  }
  assert.equal(notices().length, 0);
});

test("A5 a persisted store keeps its memory state and does not throw when the write is refused", () => {
  storage.refused.add("osionos:test-preference");
  const store = create<{ width: number }>()(persist(() => ({ width: 260 }), {
    name: "osionos:test-preference",
    storage: noticingJsonStorage("Test preference"),
  }));
  assert.doesNotThrow(() => store.setState({ width: 300 }));
  assert.equal(store.getState().width, 300);
  assert.equal(storage.getItem("osionos:test-preference"), null);
  assert.equal(notices().length, 1);
});

test("A5 a persisted store hands its text to the writer it is given", () => {
  const written: string[] = [];
  const store = create<{ body: string }>()(persist(() => ({ body: "" }), {
    name: "osionos:test-content",
    storage: noticingJsonStorage("Test content", (key, text) => { written.push(`${key}=${text}`); return false; }),
  }));
  store.setState({ body: "hello" });
  assert.deepEqual(written, ['osionos:test-content={"state":{"body":"hello"},"version":0}']);
  assert.equal(notices().length, 1);
});

test("A5 a localStorage whose getter throws refuses the write without throwing or a notice", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() { throw new DOMException("The operation is insecure.", "SecurityError"); },
  });
  try {
    assert.equal(trySetItem("k", "v"), false);
    assert.equal(noticingWriter("Blocked store")("k", "v"), false);
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: storage });
  }
  assert.equal(notices().length, 0);
});

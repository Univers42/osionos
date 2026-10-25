/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   binding-sources.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { createStoreRecordSource } from "../../src/entities/block/model/bindingSources.ts";

function makeStore() {
  let state: any = { a: 1, b: 2, c: 3 };
  const listeners = new Set<(next: any, prev: any) => void>();
  return {
    getState: () => state,
    subscribe: (cb: (next: any, prev: any) => void) => {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    setState: (next: any) => {
      const prev = state;
      state = next;
      for (const cb of [...listeners]) cb(state, prev);
    },
    get activeListeners() { return listeners.size; },
  };
}

test("per-field: changing only b notifies b once and a zero times", () => {
  const store = makeStore();
  const source = createStoreRecordSource({
    id: "settings:t",
    label: "t",
    fields: [{ key: "a", display: "text", label: "A" }, { key: "b", display: "text", label: "B" }],
    store,
    read: (s: any) => ({ a: s.a, b: s.b }),
    isLoading: () => false,
  });
  let aCalls = 0;
  let bCalls = 0;
  const unsubA = source.subscribe("a", () => { aCalls++; });
  source.subscribe("b", () => { bCalls++; });
  store.setState({ a: 1, b: 9, c: 3 });
  assert.equal(bCalls, 1);
  assert.equal(aCalls, 0);
  unsubA();
});

test("per-field: changing an unsubscribed field c notifies no listener", () => {
  const store = makeStore();
  const source = createStoreRecordSource({
    id: "settings:t2",
    label: "t2",
    fields: [{ key: "a", display: "text", label: "A" }],
    store,
    read: (s: any) => ({ a: s.a, c: s.c }),
    isLoading: () => false,
  });
  let aCalls = 0;
  source.subscribe("a", () => { aCalls++; });
  store.setState({ a: 1, b: 2, c: 999 });
  assert.equal(aCalls, 0);
});

test("store subscription created on first listener and released after last unsubscribe", () => {
  const store = makeStore();
  const source = createStoreRecordSource({
    id: "settings:t3",
    label: "t3",
    fields: [{ key: "a", display: "text", label: "A" }],
    store,
    read: (s: any) => ({ a: s.a }),
    isLoading: () => false,
  });
  assert.equal(store.activeListeners, 0);
  const unsub = source.subscribe("a", () => {});
  assert.equal(store.activeListeners, 1);
  unsub();
  assert.equal(store.activeListeners, 0);
});

test("get returns stored value; read->null gives loading/unavailable by isLoading", () => {
  const store = makeStore();
  let loading = true;
  const source = createStoreRecordSource({
    id: "settings:t4",
    label: "t4",
    fields: [{ key: "a", display: "text", label: "A" }],
    store,
    read: (s: any) => null,
    isLoading: () => loading,
  });
  assert.equal(source.get("a"), undefined);
  assert.equal(source.status(), "loading");
  loading = false;
  assert.equal(source.status(), "unavailable");

  const store2 = makeStore();
  const source2 = createStoreRecordSource({
    id: "settings:t5",
    label: "t5",
    fields: [{ key: "a", display: "text", label: "A" }],
    store: store2,
    read: (s: any) => ({ a: s.a }),
    isLoading: () => false,
  });
  assert.equal(source2.get("a"), 1);
  assert.equal(source2.status(), "ready");
});

test("set with failing validate does not call write; valid calls write once", () => {
  const store = makeStore();
  const writes: any[] = [];
  const source = createStoreRecordSource({
    id: "settings:t6",
    label: "t6",
    fields: [{ key: "a", display: "text", label: "A", validate: (v: unknown) => (String(v).length > 3 ? "Too long" : null) }],
    store,
    read: (s: any) => ({ a: s.a }),
    isLoading: () => false,
    write: (patch) => writes.push(patch),
  });
  source.set!("a", "toolong");
  assert.equal(writes.length, 0);
  source.set!("a", "ok");
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], { a: "ok" });
});

test("readOnly field: set refused and write never called", () => {
  const store = makeStore();
  const writes: any[] = [];
  const source = createStoreRecordSource({
    id: "settings:t7",
    label: "t7",
    fields: [{ key: "a", display: "text", label: "A", readOnly: true }],
    store,
    read: (s: any) => ({ a: s.a }),
    isLoading: () => false,
    write: (patch) => writes.push(patch),
  });
  // BoundField-level: source.set exists but refuses readOnly.
  if (source.set) source.set("a", 5);
  assert.equal(writes.length, 0);
});

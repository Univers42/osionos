/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   keyed-flag.test.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createKeyedFlag } from "@/shared/lib/subscriptions/keyedFlag";
import { keyStore } from "./key-store-fixtures";

function listen(flag: ReturnType<typeof createKeyedFlag>, keys: string[]) {
  const woken: string[] = [];
  const unsubscribe = keys.map((key) => flag.subscribe(key, () => woken.push(key)));
  return { woken, unsubscribe };
}

test("a key change wakes only the listeners of the old and the new key", () => {
  const store = keyStore("a");
  const flag = createKeyedFlag(store.subscribe, store.read);
  const { woken } = listen(flag, ["a", "b", "c"]);
  store.set("b");
  assert.deepEqual(woken.sort(), ["a", "b"]);
  assert.equal(flag.is("b"), true);
  assert.equal(flag.is("a"), false);
  store.set(null);
  assert.deepEqual(woken.sort(), ["a", "b", "b"]);
});

test("a store change that keeps the key wakes nobody", () => {
  const store = keyStore("a");
  const flag = createKeyedFlag(store.subscribe, store.read);
  const { woken } = listen(flag, ["a", "b"]);
  store.set("a");
  store.set("a");
  assert.deepEqual(woken, []);
});

test("two listeners on one key both wake (StrictMode subscribes twice)", () => {
  const store = keyStore(null);
  const flag = createKeyedFlag(store.subscribe, store.read);
  const { woken } = listen(flag, ["a", "a"]);
  store.set("a");
  assert.deepEqual(woken, ["a", "a"]);
});

test("holds one store subscription while anyone listens, none after the last leaves", () => {
  const store = keyStore(null);
  const flag = createKeyedFlag(store.subscribe, store.read);
  assert.equal(store.listenerCount(), 0);
  const { unsubscribe } = listen(flag, ["a", "b", "b"]);
  assert.equal(store.listenerCount(), 1);
  unsubscribe[0]();
  unsubscribe[1]();
  assert.equal(store.listenerCount(), 1);
  unsubscribe[2]();
  assert.equal(store.listenerCount(), 0);
});

test("re-attaching after a gap reads the key afresh", () => {
  const store = keyStore("a");
  const flag = createKeyedFlag(store.subscribe, store.read);
  listen(flag, ["a"]).unsubscribe[0]();
  store.set("b");
  const { woken } = listen(flag, ["b", "a"]);
  store.set("b");
  assert.deepEqual(woken, []);
  store.set("a");
  assert.deepEqual(woken.sort(), ["a", "b"]);
});

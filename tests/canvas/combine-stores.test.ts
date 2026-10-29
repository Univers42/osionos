/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   combine-stores.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { combineStores } from "../../src/features/bindings/model/combineStores.ts";

function makeStore(initial: unknown) {
  let state = initial;
  const listeners = new Set<(next: unknown, prev: unknown) => void>();
  return {
    getState: () => state,
    subscribe: (cb: (next: unknown, prev: unknown) => void) => {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    setState: (next: unknown) => {
      const prev = state;
      state = next;
      for (const cb of [...listeners]) cb(state, prev);
    },
    get activeListeners() { return listeners.size; },
  };
}

test("combineStores: getState returns the same object until a store changes", () => {
  const a = makeStore({ x: 1 });
  const b = makeStore({ y: 2 });
  const combined = combineStores({ a, b } as any);
  const first = combined.getState();
  assert.equal(combined.getState(), first);
  a.setState({ x: 9 });
  const second = combined.getState();
  assert.notEqual(second, first);
  assert.deepEqual(second, { a: { x: 9 }, b: { y: 2 } });
});

test("combineStores: a listener receives (next, previous) combined snapshots", () => {
  const a = makeStore({ x: 1 });
  const b = makeStore({ y: 2 });
  const combined = combineStores({ a, b } as any);
  const seen: Array<{ next: unknown; prev: unknown }> = [];
  combined.subscribe((next, prev) => { seen.push({ next, prev }); });
  a.setState({ x: 9 });
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].next, { a: { x: 9 }, b: { y: 2 } });
  assert.deepEqual(seen[0].prev, { a: { x: 1 }, b: { y: 2 } });
});

test("combineStores: subscribes underlying on first listener and releases after last", () => {
  const a = makeStore({ x: 1 });
  const b = makeStore({ y: 2 });
  const combined = combineStores({ a, b } as any);
  assert.equal(a.activeListeners, 0);
  assert.equal(b.activeListeners, 0);
  const unsub = combined.subscribe(() => {});
  assert.equal(a.activeListeners, 1);
  assert.equal(b.activeListeners, 1);
  unsub();
  assert.equal(a.activeListeners, 0);
  assert.equal(b.activeListeners, 0);
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-cache-outbox-key.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The outbox ledger key shares the page cache's "osio:pages:" prefix. The cache must neither load
// it as a workspace nor write over it: it once loaded as workspace "outbox" = [] and an unscoped
// savePagesCache stored "[]" there, wiping every sync confirmation.

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import type { PageEntry } from "@/entities/page";
import {
  flushScheduledPagesCachePersist,
  loadPagesCache,
  PAGE_OUTBOX_KEY,
  savePagesCache,
} from "@/store/pageStore.helpers";

const LEDGER = JSON.stringify({ "65a000000000000000000001": "stamp-1" });
let store = new Map<string, string>();

function page(id: string, workspaceId: string): PageEntry {
  return { _id: id, title: id, workspaceId };
}

beforeEach(() => {
  store = new Map<string, string>();
  const storage = {
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
});

test("loadPagesCache does not read the outbox ledger as a workspace", () => {
  store.set(PAGE_OUTBOX_KEY, LEDGER);
  store.set("osio:pages:ws1", JSON.stringify([page("p1", "ws1")]));
  assert.deepEqual(Object.keys(loadPagesCache()), ["ws1"]);
});

test("an unscoped save after a load leaves the ledger byte-identical", () => {
  store.set(PAGE_OUTBOX_KEY, LEDGER);
  store.set("osio:pages:ws1", JSON.stringify([page("p1", "ws1")]));
  const pages = { ...loadPagesCache(), ws2: [page("p2", "ws2")] };
  savePagesCache(pages);
  flushScheduledPagesCachePersist();
  assert.equal(store.get(PAGE_OUTBOX_KEY), LEDGER);
  assert.equal(store.get("osio:pages:ws2"), JSON.stringify([page("p2", "ws2")]));
});

test("a workspace that maps onto the ledger key is never written", () => {
  store.set(PAGE_OUTBOX_KEY, LEDGER);
  savePagesCache({ outbox: [] });
  flushScheduledPagesCachePersist();
  assert.equal(store.get(PAGE_OUTBOX_KEY), LEDGER);
});

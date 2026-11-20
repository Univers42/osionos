/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   templates-panel-model.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "@/entities/block";
import type { CatalogueCard } from "@/data/templates/catalogue/types";
import { listCatalogue } from "../../src/data/templates/catalogue/index.ts";
import { filterCards } from "../../src/widgets/templates-panel/model/filterCards.ts";
import { createPreviewCache, PREVIEW_CACHE_LIMIT } from "../../src/widgets/templates-panel/model/previewCache.ts";

const cards = await listCatalogue();
const block = (id: string): Block[] => [{ id, type: "paragraph", content: id }];
const ids = (items: CatalogueCard[]): string[] => items.map((card) => card.id);

test("filterCards returns the whole catalogue in order for an empty query", () => {
  assert.deepEqual(filterCards(cards, "   ", "all"), cards);
  assert.deepEqual(ids(filterCards(cards, "", "all")), ids(cards));
});

test("filterCards finds only the real CRM template for a trimmed case-insensitive query", () => {
  assert.deepEqual(ids(filterCards(cards, "  CrM  ", "all")), ["tpl:crm-pipeline"]);
});

test("filterCards selects all 37 page templates", () => {
  assert.equal(filterCards(cards, "", "page").length, 37);
});

test("filterCards combines the query and category", () => {
  assert.deepEqual(ids(filterCards(cards, "project", "work")), ["tpl:project-tracker"]);
  assert.deepEqual(filterCards(cards, "project", "personal"), []);
});

test("filterCards matches descriptions and categories without reordering", () => {
  const matches = filterCards(cards, "PIPELINE VALUE", "all");
  assert.deepEqual(ids(matches), ["tpl:crm-pipeline"]);
  assert.deepEqual(filterCards(cards, "SCHOOL", "all"), filterCards(cards, "", "school"));
});

test("previewCache evicts the least recently used entry at its limit", () => {
  const cache = createPreviewCache(2);
  cache.set("a", block("a"));
  cache.set("b", block("b"));
  cache.set("c", block("c"));
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.size(), 2);
});

test("previewCache get refreshes recency", () => {
  const cache = createPreviewCache(2);
  cache.set("a", block("a"));
  cache.set("b", block("b"));
  assert.deepEqual(cache.get("a"), block("a"));
  cache.set("c", block("c"));
  assert.equal(cache.get("b"), undefined);
  assert.deepEqual(cache.get("a"), block("a"));
});

test("previewCache never grows past the shared preview limit", () => {
  const cache = createPreviewCache(PREVIEW_CACHE_LIMIT);
  for (let index = 0; index < PREVIEW_CACHE_LIMIT + 5; index += 1) {
    cache.set(`tpl:${index}`, block(`block-${index}`));
    assert.ok(cache.size() <= PREVIEW_CACHE_LIMIT);
  }
  assert.equal(cache.size(), PREVIEW_CACHE_LIMIT);
  assert.equal(cache.get("tpl:0"), undefined);
});

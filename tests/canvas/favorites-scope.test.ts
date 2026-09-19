/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   favorites-scope.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Regression guard for the bug: favorites (stored per-user) bled across
// workspaces because the sidebar rendered every starred id without checking
// which workspace the page belonged to.

import assert from "node:assert/strict";
import test from "node:test";

import { favoritesForWorkspace, isServerPageId } from "../../src/store/favorites/favoritesScope.ts";

// Pages p1,p2 live in workspace A; p3 in workspace B. (Mirrors pagesIndex.)
const workspaceOf = (id: string): string | undefined =>
  ({ p1: "wsA", p2: "wsA", p3: "wsB" })[id];

test("scopes favorites to the active workspace — the cross-workspace bleed is gone", () => {
  const favorites = ["p1", "p3", "p2"]; // starred across BOTH workspaces
  assert.deepEqual(favoritesForWorkspace(favorites, "wsA", workspaceOf), ["p1", "p2"]);
  assert.deepEqual(favoritesForWorkspace(favorites, "wsB", workspaceOf), ["p3"]);
});

test("preserves order and never shows another workspace's stars", () => {
  const favorites = ["p3", "p1"]; // p3 (wsB) first
  // In workspace A only p1 survives — p3 is another workspace's favorite.
  assert.deepEqual(favoritesForWorkspace(favorites, "wsA", workspaceOf), ["p1"]);
});

test("unloaded favorites (unknown workspace) are hidden, as before", () => {
  const favorites = ["p1", "ghost"]; // 'ghost' isn't in the loaded index
  assert.deepEqual(favoritesForWorkspace(favorites, "wsA", workspaceOf), ["p1"]);
});

test("no active workspace → nothing to show (never falls back to all)", () => {
  assert.deepEqual(favoritesForWorkspace(["p1", "p3"], "", workspaceOf), []);
});

// Regression guard for the second bug: POST /api/favorites answered 422
// ("pageId must be a UUID") for every star, because the store posted whatever id
// the page carried. osionos_page_favorites.page_id is a uuid column, so an id of
// any other shape can never be stored — it must not reach the network.
test("accepts the uuid shape the bridge's own UUID_REGEX accepts", () => {
  assert.equal(isServerPageId("fcf48b5b-2fed-41d6-9c5d-0075988728d1"), true);
  assert.equal(isServerPageId("5a4b1c2d-2222-4222-8222-000000000002"), true);
  assert.equal(isServerPageId("FCF48B5B-2FED-41D6-9C5D-0075988728D1"), true);
});

test("rejects every id the bridge would answer 422 for", () => {
  assert.equal(isServerPageId("home"), false);
  assert.equal(isServerPageId(""), false);
  assert.equal(isServerPageId("p1"), false);
  assert.equal(isServerPageId("fcf48b5b2fed41d69c5d0075988728d1"), false); // unhyphenated
  assert.equal(isServerPageId("fcf48b5b-2fed-41d6-9c5d-0075988728d1x"), false);
  // Version nibble 0 and variant nibble c are outside RFC 4122 — the bridge's
  // regex pins [1-5] and [89ab], so these are 422s too.
  assert.equal(isServerPageId("fcf48b5b-2fed-01d6-9c5d-0075988728d1"), false);
  assert.equal(isServerPageId("fcf48b5b-2fed-41d6-cc5d-0075988728d1"), false);
});

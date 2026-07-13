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

import { favoritesForWorkspace } from "../../src/store/favorites/favoritesScope.ts";

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

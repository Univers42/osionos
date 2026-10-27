/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   kept-tabs.test.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 17:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 17:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { keepRecentTabs } from "../../src/widgets/workspace-grid/model/keptTabs.ts";

test("the active tab moves to the front of the kept list", () => {
  assert.deepEqual(keepRecentTabs(["a", "b"], "c", ["a", "b", "c"], 4), ["c", "a", "b"]);
  assert.deepEqual(keepRecentTabs(["c", "a", "b"], "b", ["a", "b", "c"], 4), ["b", "c", "a"]);
});

test("the least recently shown tab is dropped past the cap", () => {
  assert.deepEqual(keepRecentTabs(["c", "b", "a"], "d", ["a", "b", "c", "d"], 3), ["d", "c", "b"]);
});

test("a closed tab is forgotten", () => {
  assert.deepEqual(keepRecentTabs(["a", "b", "c"], "a", ["a", "c"], 4), ["a", "c"]);
});

test("an unchanged list is returned as the same array", () => {
  const kept = ["a", "b"];
  assert.equal(keepRecentTabs(kept, "a", ["a", "b"], 4), kept);
});

test("no active tab keeps nothing new", () => {
  assert.deepEqual(keepRecentTabs(["a"], null, ["a"], 4), ["a"]);
});

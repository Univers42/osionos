/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workbench-store.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import { sanitizePersisted } from "../../src/widgets/workbench/model/workbenchStore.ts";

test("unknown dockTab falls back to terminal", () => {
  assert.equal(sanitizePersisted({ dockTab: "bogus" }, 1000).dockTab, "terminal");
  assert.equal(sanitizePersisted({ dockTab: "ports" }, 1000).dockTab, "ports");
});

test("dockHeight is clamped to the viewport; non-numbers are dropped", () => {
  assert.equal(sanitizePersisted({ dockHeight: 5000 }, 1000).dockHeight, 700);
  assert.equal(sanitizePersisted({ dockHeight: 10 }, 1000).dockHeight, 120);
  assert.equal("dockHeight" in sanitizePersisted({ dockHeight: "x" }, 1000), false);
});

test("booleans pass only when boolean; garbage input yields the safe default", () => {
  assert.deepEqual(sanitizePersisted({ dockOpen: true, statusBarVisible: "no" }, 1000), {
    dockOpen: true,
    dockTab: "terminal",
  });
  assert.deepEqual(sanitizePersisted(null, 1000), { dockTab: "terminal" });
});

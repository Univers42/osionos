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

import { sanitizePersisted, useWorkbenchStore } from "../../src/widgets/workbench/model/workbenchStore.ts";

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
    dockPosition: "bottom",
  });
  assert.deepEqual(sanitizePersisted(null, 1000), { dockTab: "terminal", dockPosition: "bottom" });
});

test("an older payload without the position fields sanitizes to the bottom dock and keeps the default width", () => {
  const old = sanitizePersisted({ dockOpen: true, dockTab: "output", dockHeight: 300, statusBarVisible: false }, 1000);
  assert.equal(old.dockPosition, "bottom");
  assert.equal("dockWidth" in old, false);
  assert.equal(old.dockHeight, 300);
});

test("dockPosition keeps the three known values and falls back to bottom for anything else", () => {
  for (const position of ["bottom", "left", "right"]) assert.equal(sanitizePersisted({ dockPosition: position }, 1000).dockPosition, position);
  for (const bogus of ["top", "", "RIGHT", 1, null, {}]) assert.equal(sanitizePersisted({ dockPosition: bogus }, 1000).dockPosition, "bottom");
});

test("dockWidth is clamped to half the viewport width and to the minimum; non-numbers are dropped", () => {
  assert.equal(sanitizePersisted({ dockWidth: 5000 }, 1000).dockWidth, 500);
  assert.equal(sanitizePersisted({ dockWidth: 10 }, 1000).dockWidth, 240);
  assert.equal(sanitizePersisted({ dockWidth: 333.4 }, 1000).dockWidth, 333);
  assert.equal("dockWidth" in sanitizePersisted({ dockWidth: "x" }, 1000), false);
});

test("the width is clamped against its own viewport width, the height against the viewport height", () => {
  const out = sanitizePersisted({ dockWidth: 5000, dockHeight: 5000 }, 1000, 1600);
  assert.equal(out.dockWidth, 800);
  assert.equal(out.dockHeight, 700);
});

test("setDockPosition ignores an invalid position and setDockWidth clamps with the window width", () => {
  const holder = globalThis as { innerWidth?: number };
  const before = holder.innerWidth;
  holder.innerWidth = 1600;
  try {
    const store = useWorkbenchStore.getState();
    assert.equal(store.dockPosition, "bottom");
    assert.equal(store.dockWidth, 420);
    store.setDockPosition("right");
    assert.equal(useWorkbenchStore.getState().dockPosition, "right");
    store.setDockPosition("top" as never);
    assert.equal(useWorkbenchStore.getState().dockPosition, "right");
    store.setDockWidth(5000);
    assert.equal(useWorkbenchStore.getState().dockWidth, 800);
    store.setDockWidth(10);
    assert.equal(useWorkbenchStore.getState().dockWidth, 240);
  } finally {
    holder.innerWidth = before;
    useWorkbenchStore.setState({ dockPosition: "bottom", dockWidth: 420 });
  }
});

test("maximize toggles, closeDock and a closing toggleDock reset it, setDockPosition keeps it", () => {
  const api = useWorkbenchStore;
  try {
    api.setState({ dockOpen: true, dockMaximized: false });
    api.getState().toggleDockMaximized();
    assert.equal(api.getState().dockMaximized, true);
    api.getState().setDockPosition("right");
    assert.equal(api.getState().dockMaximized, true);
    api.getState().closeDock();
    assert.deepEqual([api.getState().dockOpen, api.getState().dockMaximized], [false, false]);
    api.setState({ dockOpen: true, dockMaximized: true });
    api.getState().toggleDock();
    assert.deepEqual([api.getState().dockOpen, api.getState().dockMaximized], [false, false]);
    api.getState().toggleDock();
    assert.equal(api.getState().dockMaximized, false);
    api.getState().closeDock();
    api.getState().toggleDockMaximized();
    assert.deepEqual([api.getState().dockOpen, api.getState().dockMaximized], [true, true]);
  } finally {
    api.setState({ dockOpen: false, dockMaximized: false, dockPosition: "bottom" });
  }
});

test("maximize is never persisted: sanitizePersisted ignores it and partialize omits it", () => {
  assert.equal("dockMaximized" in sanitizePersisted({ dockMaximized: true }, 1000), false);
  const options = useWorkbenchStore.persist.getOptions();
  const saved = options.partialize?.({ ...useWorkbenchStore.getState(), dockMaximized: true });
  assert.equal(saved !== undefined && "dockMaximized" in saved, false);
});

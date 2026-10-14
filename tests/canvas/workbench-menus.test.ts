/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workbench-menus.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import { terminalMenuAction, workbenchViewItems, type WorkbenchViewActionMap } from "../../src/widgets/top-bar/model/workbenchMenuItems.ts";

test("terminalMenuAction: split always returns split", () => {
  assert.equal(terminalMenuAction("split", { dockOpen: false, dockTab: "terminal" }), "split");
  assert.equal(terminalMenuAction("split", { dockOpen: true, dockTab: "terminal" }), "split");
  assert.equal(terminalMenuAction("split", { dockOpen: true, dockTab: "problems" }), "split");
});

test("terminalMenuAction: new with dock closed returns reattach", () => {
  assert.equal(terminalMenuAction("new", { dockOpen: false, dockTab: "terminal" }), "reattach");
  assert.equal(terminalMenuAction("new", { dockOpen: false, dockTab: "problems" }), "reattach");
});

test("terminalMenuAction: new with dock open on problems returns reattach", () => {
  assert.equal(terminalMenuAction("new", { dockOpen: true, dockTab: "problems" }), "reattach");
  assert.equal(terminalMenuAction("new", { dockOpen: true, dockTab: "output" }), "reattach");
  assert.equal(terminalMenuAction("new", { dockOpen: true, dockTab: "ports" }), "reattach");
});

test("terminalMenuAction: new with dock open on terminal returns new", () => {
  assert.equal(terminalMenuAction("new", { dockOpen: true, dockTab: "terminal" }), "new");
});

test("workbenchViewItems: returns exactly 5 items in correct order with correct ids", () => {
  const calls: string[] = [];
  const actions: WorkbenchViewActionMap = {
    toggleDock: () => calls.push("toggleDock"),
    toggleStatusBar: () => calls.push("toggleStatusBar"),
    openProblems: () => calls.push("openProblems"),
    openOutput: () => calls.push("openOutput"),
    openPorts: () => calls.push("openPorts"),
  };
  const items = workbenchViewItems(actions);
  assert.equal(items.length, 5);
  assert.deepEqual(items.map((i) => i.id), [
    "view.panel",
    "view.statusbar",
    "view.problems",
    "view.output",
    "view.ports",
  ]);
});

test("workbenchViewItems: Toggle Panel carries accelerator ⌃J", () => {
  const actions: WorkbenchViewActionMap = {
    toggleDock: () => {},
    toggleStatusBar: () => {},
    openProblems: () => {},
    openOutput: () => {},
    openPorts: () => {},
  };
  const items = workbenchViewItems(actions);
  const panelItem = items.find((i) => i.id === "view.panel");
  assert.ok(panelItem);
  assert.equal(panelItem.accelerator, "⌃J");
});

test("workbenchViewItems: each item calls its injected action exactly once", () => {
  const calls: string[] = [];
  const actions: WorkbenchViewActionMap = {
    toggleDock: () => calls.push("toggleDock"),
    toggleStatusBar: () => calls.push("toggleStatusBar"),
    openProblems: () => calls.push("openProblems"),
    openOutput: () => calls.push("openOutput"),
    openPorts: () => calls.push("openPorts"),
  };
  const items = workbenchViewItems(actions);
  for (const item of items) {
    item.run();
  }
  assert.deepEqual(calls, ["toggleDock", "toggleStatusBar", "openProblems", "openOutput", "openPorts"]);
});

test("workbenchViewItems: separators close the panel group and the dock-tab group", () => {
  const noop = (): void => {};
  const items = workbenchViewItems({
    toggleDock: noop, toggleStatusBar: noop, openProblems: noop, openOutput: noop, openPorts: noop,
  });
  assert.deepEqual(items.map((i) => i.separatorAfter === true), [false, true, false, false, true]);
});

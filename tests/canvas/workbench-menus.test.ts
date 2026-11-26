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
import {
  terminalMenuAction, workbenchAppearanceItems, workbenchViewItems, type WorkbenchViewActionMap,
} from "../../src/widgets/top-bar/model/workbenchMenuItems.ts";

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

/** An action map whose every action records its name, and whose region readers answer from `state`. */
function recordingActions(calls: string[], state = { dock: false, status: false }): WorkbenchViewActionMap {
  return {
    toggleDock: () => calls.push("toggleDock"),
    toggleStatusBar: () => calls.push("toggleStatusBar"),
    openProblems: () => calls.push("openProblems"),
    openOutput: () => calls.push("openOutput"),
    openPorts: () => calls.push("openPorts"),
    isDockOpen: () => state.dock,
    isStatusBarVisible: () => state.status,
  };
}

test("workbenchViewItems: returns the three dock-tab rows in order, the toggles live under Appearance", () => {
  const items = workbenchViewItems(recordingActions([]));
  assert.deepEqual(items.map((i) => i.id), ["view.problems", "view.output", "view.ports"]);
});

test("workbenchViewItems: each item calls its injected action exactly once", () => {
  const calls: string[] = [];
  for (const item of workbenchViewItems(recordingActions(calls))) item.run();
  assert.deepEqual(calls, ["openProblems", "openOutput", "openPorts"]);
});

test("workbenchViewItems: one separator closes the dock-tab group", () => {
  const items = workbenchViewItems(recordingActions([]));
  assert.deepEqual(items.map((i) => i.separatorAfter === true), [false, false, true]);
});

test("workbenchAppearanceItems: Panel and Status bar keep their old ids, Panel carries ⌃J", () => {
  const items = workbenchAppearanceItems(recordingActions([]));
  assert.deepEqual(items.map((i) => [i.id, i.label, i.accelerator]), [
    ["view.panel", "Panel", "⌃J"],
    ["view.statusbar", "Status bar", undefined],
  ]);
});

test("workbenchAppearanceItems: each row calls its action once", () => {
  const calls: string[] = [];
  for (const item of workbenchAppearanceItems(recordingActions(calls))) item.run();
  assert.deepEqual(calls, ["toggleDock", "toggleStatusBar"]);
});

test("workbenchAppearanceItems: checked is read from the region readers when asked, not when built", () => {
  const state = { dock: false, status: true };
  const items = workbenchAppearanceItems(recordingActions([], state));
  assert.deepEqual(items.map((i) => i.checked?.()), [false, true]);
  state.dock = true;
  state.status = false;
  assert.deepEqual(items.map((i) => i.checked?.()), [true, false]);
});

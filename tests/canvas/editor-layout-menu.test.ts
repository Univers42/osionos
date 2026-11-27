/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   editor-layout-menu.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// View › Editor layout: row model, label uniqueness, and Single keeping every tab.

import assert from "node:assert/strict";
import test from "node:test";

const { viewMenu } = await import("@/widgets/top-bar/model/menus/viewMenu");
const { selectionMenu } = await import("@/widgets/top-bar/model/menus/selectionMenu");
const { flattenActions, isSubmenu } = await import("@/widgets/top-bar/model/menuTypes");
const { useWorkspaceLayout } = await import("@/widgets/workspace-grid/model/workspaceLayout");
const { homeTab, trashTab, consoleTab } = await import("@/widgets/workspace-grid/model/layoutPersist");
const { collectPanes } = await import("@/widgets/workspace-grid/model/layoutTree");

const submenu = () => {
  const found = viewMenu().items.find((i) => isSubmenu(i) && i.id === "view.editor-layout");
  assert.ok(found && isSubmenu(found), "View has an Editor layout submenu");
  return found;
};
const row = (id: string) => submenu().children.find((c) => !isSubmenu(c) && c.id === id);

test("Editor layout lists four splits and Single, Ctrl+\\ on split right", () => {
  const ids = submenu().children.filter((c) => !isSubmenu(c)).map((c) => c.id);
  assert.deepEqual(ids, ["layout.split-up", "layout.split-down", "layout.split-left", "layout.split-right", "layout.single"]);
  assert.equal(row("layout.split-right")?.accelerator, "Ctrl+\\");
});

test("labels never collide with the Selection menu's split rows", () => {
  const mine = new Set(flattenActions(submenu().children).map((a) => a.label));
  for (const action of flattenActions(selectionMenu().items)) assert.equal(mine.has(action.label), false, action.label);
});

test("Single merges every pane's tabs into one pane and loses none", () => {
  const store = useWorkspaceLayout.getState();
  store.openTab(homeTab());
  store.openTab(trashTab());
  store.splitActivePane(useWorkspaceLayout.getState().activePaneId, "row");
  useWorkspaceLayout.getState().openTab(consoleTab());
  const tabCount = () => collectPanes(useWorkspaceLayout.getState().root).reduce((n, p) => n + p.tabs.length, 0);
  const before = tabCount();
  assert.ok(collectPanes(useWorkspaceLayout.getState().root).length >= 2);
  assert.equal(row("layout.single")?.disabled?.(), false);
  row("layout.single")?.run();
  assert.equal(collectPanes(useWorkspaceLayout.getState().root).length, 1);
  assert.equal(tabCount(), before);
  assert.equal(row("layout.single")?.disabled?.(), true);
});

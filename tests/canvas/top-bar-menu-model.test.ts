/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   top-bar-menu-model.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The menu model: submenus flatten for the palette, the one-level union is
// discriminated by `children`, and the layout guards that keep File › Close tab
// and File › Close pane from ever closing the whole workspace.
//
// `buildCommands` is driven by a stubbed `./menus` (the assembled menus pull the
// api client and the auth barrel, which read `import.meta.env` at load — the
// settings-commands test stubs the same graph for the same reason).

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

import type { LayoutNode, PaneNode, WorkspaceTab } from "@/widgets/workspace-grid/model/layoutTree";
import type { MenuItem } from "@/widgets/top-bar/model/menuTypes";

const MENUS_STUB = `
export function buildMenus() {
  return [
    { id: "file", label: "File", items: [
      { id: "file.new-page", label: "New page", accelerator: "x", run: () => undefined },
      { id: "file.preferences", label: "Preferences", children: [
        { id: "file.settings", label: "Settings", run: () => undefined },
        { id: "file.shortcuts", label: "Keyboard shortcuts", run: () => undefined },
      ] },
    ] },
    { id: "help", label: "Help", items: [
      { id: "help.shortcuts", label: "Keyboard shortcuts", run: () => undefined },
      { id: "help.docs", label: "Documentation", run: () => undefined },
    ] },
  ];
}
`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    if (resolved.url.endsWith("/src/widgets/top-bar/model/menus.ts")) {
      return { url: `data:text/javascript,${encodeURIComponent(MENUS_STUB)}`, shortCircuit: true };
    }
    return resolved;
  },
});

const { isSubmenu, flattenActions } = await import("@/widgets/top-bar/model/menuTypes");
const { cycleIndex, tabCycleTarget, canCloseTab, canClosePane } = await import("@/widgets/top-bar/model/menus/layoutGuards");
const { buildCommands } = await import("@/widgets/top-bar/model/commands");

const noop = (): void => undefined;
const tab = (tabId: string): WorkspaceTab => ({ tabId, pageId: `page-${tabId}`, workspaceId: "w", kind: "page" });
const pane = (id: string, tabIds: string[], activeTabId: string | null = tabIds[0] ?? null): PaneNode => ({
  type: "pane", id, tabs: tabIds.map(tab), activeTabId,
});
const split = (children: LayoutNode[]): LayoutNode => ({ type: "split", id: "s", direction: "row", sizes: children.map(() => 100 / children.length), children });

test("isSubmenu tells a submenu from an action by its children", () => {
  const submenu: MenuItem = { id: "a", label: "A", children: [] };
  const action: MenuItem = { id: "b", label: "B", run: noop };
  assert.equal(isSubmenu(submenu), true);
  assert.equal(isSubmenu(action), false);
});

test("flattenActions lists submenu children in place and carries the group separator to the last child", () => {
  const items: MenuItem[] = [
    { id: "one", label: "One", run: noop },
    { id: "sub", label: "Sub", separatorAfter: true, children: [
      { id: "sub.a", label: "A", run: noop },
      { id: "sub.b", label: "B", run: noop },
    ] },
    { id: "two", label: "Two", run: noop },
  ];
  const flat = flattenActions(items);
  assert.deepEqual(flat.map((item) => item.id), ["one", "sub.a", "sub.b", "two"]);
  assert.deepEqual(flat.map((item) => item.separatorAfter === true), [false, false, true, false]);
});

test("flattenActions keeps a child's own separator when the submenu has none", () => {
  const flat = flattenActions([{ id: "sub", label: "Sub", children: [{ id: "a", label: "A", run: noop, separatorAfter: true }] }]);
  assert.equal(flat[0].separatorAfter, true);
});

test("buildCommands flattens a submenu into commands grouped 'File › Preferences'", () => {
  const commands = buildCommands({ openSettings: noop });
  const settings = commands.find((command) => command.id === "file.settings");
  assert.ok(settings, "the submenu child is a palette command");
  assert.equal(settings.group, "File › Preferences");
  assert.equal(commands.some((command) => command.label === "Preferences"), false, "the submenu row itself is not a command");
});

test("buildCommands still keeps the first of two rows sharing a label", () => {
  const shortcuts = buildCommands({ openSettings: noop }).filter((command) => command.label === "Keyboard shortcuts");
  assert.deepEqual(shortcuts.map((command) => command.id), ["file.shortcuts"]);
});

test("cycleIndex wraps in both directions", () => {
  assert.equal(cycleIndex(0, 3, 1), 1);
  assert.equal(cycleIndex(2, 3, 1), 0);
  assert.equal(cycleIndex(0, 3, -1), 2);
  assert.equal(cycleIndex(1, 3, -1), 0);
});

test("tabCycleTarget picks the neighbour, and nothing when there is nothing to cycle to", () => {
  const tabs = [tab("a"), tab("b"), tab("c")];
  assert.equal(tabCycleTarget(tabs, "a", 1), "b");
  assert.equal(tabCycleTarget(tabs, "a", -1), "c");
  assert.equal(tabCycleTarget(tabs, "c", 1), "a");
  assert.equal(tabCycleTarget([tab("a")], "a", 1), null);
  assert.equal(tabCycleTarget([], null, 1), null);
  assert.equal(tabCycleTarget(tabs, "missing", 1), null);
});

test("canClosePane is false for the only pane and true once the layout is split", () => {
  assert.equal(canClosePane(pane("p1", ["a"])), false);
  assert.equal(canClosePane(split([pane("p1", ["a"]), pane("p2", ["b"])])), true);
});

test("canCloseTab refuses the last tab of the last pane, and allows every other close", () => {
  assert.equal(canCloseTab(pane("p1", ["a"]), "p1"), false, "last tab of the last pane");
  assert.equal(canCloseTab(pane("p1", ["a", "b"]), "p1"), true, "another tab remains");
  assert.equal(canCloseTab(split([pane("p1", ["a"]), pane("p2", ["b"])]), "p1"), true, "the pane goes, the workspace stays");
  assert.equal(canCloseTab(pane("p1", []), "p1"), false, "nothing to close");
  assert.equal(canCloseTab(pane("p1", ["a"]), "gone"), false, "unknown pane");
});

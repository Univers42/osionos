/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   theme-json-tab.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The theme editor opens as a pane tab whose pageId names what it edits, so a
// restored layout reopens the same theme and a second open focuses the tab
// already there instead of adding one.

import assert from "node:assert/strict";
import test from "node:test";
import "./support/memory-local-storage.ts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { openThemeJson } from "@/features/theme-editor/model/openThemeJson";
import { ThemeJsonView } from "@/features/theme-editor/ui/ThemeJsonView";
import { parseThemeJsonPageId, themeJsonTab, type ThemeJsonTarget } from "@/widgets/workspace-grid/model/layoutPersist";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";

const TARGETS: ThemeJsonTarget[] = [{ kind: "theme", slug: "harbor-night" }, { kind: "new-theme" }, { kind: "import-theme" }];

test("every target survives the trip through a tab's pageId", () => {
  for (const target of TARGETS) assert.deepEqual(parseThemeJsonPageId(themeJsonTab(target).pageId), target);
});

test("a theme tab is a code-file tab named after what it edits", () => {
  const tab = themeJsonTab({ kind: "theme", slug: "meadow" });
  assert.equal(tab.kind, "theme-json");
  assert.equal(tab.pageId, "__theme_json__:theme:meadow");
  assert.equal(tab.title, "meadow.json");
  assert.equal(tab.icon, "icon:code");
  assert.equal(themeJsonTab({ kind: "new-theme" }).title, "new-theme.json");
  assert.equal(themeJsonTab({ kind: "import-theme" }).title, "import.json");
});

test("a pageId that is not a theme tab, or names no valid slug, parses to null", () => {
  for (const pageId of ["__theme_json__:theme:", "__theme_json__:theme:Bad Slug", "__theme_json__:theme:-edge-", "__theme_json__:other", "page-123"]) {
    assert.equal(parseThemeJsonPageId(pageId), null, pageId);
  }
});

test("opening the same theme twice leaves one tab, focused", () => {
  useWorkspaceLayout.setState({ root: { type: "pane", id: "p1", tabs: [], activeTabId: null }, activePaneId: "p1" });
  openThemeJson({ kind: "theme", slug: "meadow" });
  openThemeJson({ kind: "new-theme" });
  openThemeJson({ kind: "theme", slug: "meadow" });
  const root = useWorkspaceLayout.getState().root;
  assert.equal(root.type, "pane");
  if (root.type !== "pane") return;
  assert.deepEqual(root.tabs.map((tab) => tab.pageId), ["__theme_json__:theme:meadow", "__theme_json__:new"]);
  assert.equal(root.tabs.find((tab) => tab.tabId === root.activeTabId)?.pageId, "__theme_json__:theme:meadow");
});

test("with custom themes turned off the tab says so instead of opening an editor", () => {
  // The flag reads window.localStorage, and node has no window.
  Object.assign(globalThis, { window: globalThis });
  localStorage.setItem("osio.themes", "0");
  try {
    const html = renderToStaticMarkup(React.createElement(ThemeJsonView, { pageId: "__theme_json__:new" }));
    assert.ok(html.includes("Custom themes are turned off."), html);
  } finally {
    localStorage.removeItem("osio.themes");
    Reflect.deleteProperty(globalThis, "window");
  }
});

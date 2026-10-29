/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   recent-page-row-live-title.test.ts                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #84: a Recents entry is a visit-time snapshot, and a rename only patches it in memory.
// A page named after it was opened came back as "Untitled" after a reload; the row must
// show, and open, the loaded page's current title and icon.

import "./support/stub-bridge.ts";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActivePage } from "../../src/entities/page/model/types.ts";

const { usePageStore } = await import("../../src/store/usePageStore.ts");
const { RecentPageRow } = await import("../../src/widgets/activity-rail/ui/RecentPageRow.tsx");

const PAGE = "12345678-1234-4234-8234-123456789abc";
const SNAPSHOT: ActivePage = { id: PAGE, workspaceId: "ws", kind: "page", title: "", visitedAt: 1 };

Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({ activeSession: () => ({ userId: "u1", privateWorkspaces: [{ _id: "ws" }], sharedWorkspaces: [] }) }),
});

function loadPage(title: string, icon?: string) {
  const page = { _id: PAGE, title, icon, workspaceId: "ws", ownerId: "u1", visibility: "private", databaseId: null };
  // A server render reads a zustand store's initial state, so seed that one.
  Object.assign(usePageStore.getInitialState(), { pages: { ws: [page] }, pagesIndex: { [PAGE]: { workspaceId: "ws", index: 0 } } });
}

type RowProps = { label: string; icon: React.ReactElement<{ value: string }>; onClick: () => void };

/** Renders the row inside a host component and hands back the item it returned. */
function renderRow(recent: ActivePage): { props: RowProps; opened: ActivePage[] } {
  const opened: ActivePage[] = [];
  let item: React.ReactElement<RowProps> | null = null;
  const Host = () => {
    item = RecentPageRow({ recent, activePageId: null, onOpenPage: (page) => opened.push(page) }) as React.ReactElement<RowProps>;
    return null;
  };
  renderToStaticMarkup(React.createElement(Host));
  assert.ok(item, "the row rendered nothing for a loaded, readable page");
  return { props: (item as React.ReactElement<RowProps>).props, opened };
}

test("the row shows the loaded page's title and icon, not the visit-time snapshot", () => {
  loadPage("Q3 plan", "icon:star");
  const { props } = renderRow(SNAPSHOT);
  assert.equal(props.label, "Q3 plan");
  assert.equal(props.icon.props.value, "icon:star");
});

test("opening the row hands the current title on, so the breadcrumb and next save are fresh", () => {
  loadPage("Q3 plan");
  const { props, opened } = renderRow({ ...SNAPSHOT, title: "Untitled" });
  props.onClick();
  assert.deepEqual(opened.map((page) => [page.id, page.title]), [[PAGE, "Q3 plan"]]);
});

test("a page with no title reads Untitled, never a blank row", () => {
  loadPage("");
  assert.equal(renderRow(SNAPSHOT).props.label, "Untitled");
});

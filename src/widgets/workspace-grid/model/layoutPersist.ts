/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layoutPersist.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { genId, type LayoutNode, type PaneNode, type WorkspaceTab } from "./layoutTree";

/** Synthetic page ids for the always-available Home / Trash tabs. */
export const HOME_TAB_ID = "__home__";
export const TRASH_TAB_ID = "__trash__";

const STORAGE_KEY = "osionos.workspace.layout.v1";

export function homeTab(): WorkspaceTab {
  return { tabId: genId("tab"), pageId: HOME_TAB_ID, workspaceId: "", kind: "home", title: "Home", icon: "icon:home" };
}

export function trashTab(): WorkspaceTab {
  return { tabId: genId("tab"), pageId: TRASH_TAB_ID, workspaceId: "", kind: "trash", title: "Trash", icon: "icon:trash" };
}

/** A member profile tab — the "/people/:userId" route of tab-based navigation. */
export function profileTab(userId: string, name?: string): WorkspaceTab {
  return { tabId: genId("tab"), pageId: userId, workspaceId: "", kind: "profile", title: name ?? "Profile", icon: "icon:user" };
}

/** A single pane with just the Home tab — the default and the empty-tree reset. */
export function freshLayout(): { root: PaneNode; activePaneId: string } {
  const tab = homeTab();
  const pane: PaneNode = { type: "pane", id: genId("pane"), tabs: [tab], activeTabId: tab.tabId };
  return { root: pane, activePaneId: pane.id };
}

export function loadLayout(): { root: LayoutNode; activePaneId: string } {
  if (globalThis.window === undefined) return freshLayout();
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshLayout();
    const parsed = JSON.parse(raw) as { root?: LayoutNode; activePaneId?: string };
    if (!parsed?.root || !parsed.activePaneId) return freshLayout();
    return { root: parsed.root, activePaneId: parsed.activePaneId };
  } catch {
    return freshLayout();
  }
}

export function saveLayout(state: { root: LayoutNode; activePaneId: string }): void {
  if (globalThis.window === undefined) return;
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify({ root: state.root, activePaneId: state.activePaneId }));
  } catch {
    /* ignore storage quota / privacy-mode errors */
  }
}

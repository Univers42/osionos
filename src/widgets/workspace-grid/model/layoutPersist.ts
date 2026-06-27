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

/** Synthetic page ids for the always-available Home / Trash / Console tabs. */
export const HOME_TAB_ID = "__home__";
export const TRASH_TAB_ID = "__trash__";
export const CONSOLE_TAB_ID = "__baas_console__";
export const ADMIN_TAB_ID = "__admin__";
export const MESSAGES_TAB_ID = "__messages__";
export const COLLAB_TAB_ID = "__collab__";
export const COMMUNITY_TAB_ID = "__community__";
export const MAIL_TAB_ID = "__mail__";
export const CALENDAR_TAB_ID = "__calendar__";
export const CHAT_TAB_ID = "__chat__";

const STORAGE_KEY = "osionos.workspace.layout.v1";

/** The signed-in user's id, read from the user store's global publish seam
 *  (`__playgroundUserStore` — the same decoupling seam the api client + page ACL
 *  read). Used to SCOPE the persisted layout per account so one user's open tabs
 *  never bleed into another's on a shared browser. */
function currentUserId(): string {
  try {
    const store = (globalThis as Record<string, unknown>).__playgroundUserStore as
      { getState?: () => { activeUserId?: string } } | undefined;
    return store?.getState?.().activeUserId ?? "";
  } catch {
    return "";
  }
}

/** Per-user localStorage key (the bare base key only when no user is known). */
function layoutKey(userId: string): string {
  return userId ? `${STORAGE_KEY}.${userId}` : STORAGE_KEY;
}

const MAIL_APP_URL = ((import.meta.env as Record<string, string>)["VITE_MAIL_APP_URL"] ?? "http://localhost:3002").trim();
const CALENDAR_APP_URL = ((import.meta.env as Record<string, string>)["VITE_CALENDAR_APP_URL"] ?? "http://localhost:3003").trim();

/** Mail / Calendar open as in-app iframe tabs (stable id → focus, not duplicate). */
export function mailTab(): WorkspaceTab {
  return { tabId: genId("tab"), pageId: MAIL_TAB_ID, workspaceId: "", kind: "embed", title: "Mail", icon: "icon:mail", url: MAIL_APP_URL };
}

export function calendarTab(): WorkspaceTab {
  return { tabId: genId("tab"), pageId: CALENDAR_TAB_ID, workspaceId: "", kind: "embed", title: "Calendar", icon: "icon:calendar", url: CALENDAR_APP_URL };
}

export function homeTab(): WorkspaceTab {
  return { tabId: genId("tab"), pageId: HOME_TAB_ID, workspaceId: "", kind: "home", title: "Home", icon: "icon:home" };
}

export function trashTab(): WorkspaceTab {
  return { tabId: genId("tab"), pageId: TRASH_TAB_ID, workspaceId: "", kind: "trash", title: "Trash", icon: "icon:trash" };
}

/** The BaaS console tab — manage the tenant's own mini-baas project. */
export function consoleTab(): WorkspaceTab {
  return { tabId: genId("tab"), pageId: CONSOLE_TAB_ID, workspaceId: "", kind: "console", title: "BaaS Console", icon: "icon:database" };
}

/** A live external-database table tab (`baas:<dbId>:<table>` id). pageId == the
 *  database id so re-opening the same table focuses the tab instead of duplicating. */
export function liveDatabaseTab(databaseId: string, title: string): WorkspaceTab {
  return { tabId: genId("tab"), pageId: databaseId, workspaceId: "", kind: "database", title, icon: "icon:database", databaseId };
}

/** The admin space tab — author shell templates + manage members/grants/admins. */
export function adminTab(): WorkspaceTab {
  return { tabId: genId("tab"), pageId: ADMIN_TAB_ID, workspaceId: "", kind: "admin", title: "Admin", icon: "icon:shield" };
}

/** A member profile tab — the "/people/:userId" route of tab-based navigation. */
export function profileTab(userId: string, name?: string): WorkspaceTab {
  return { tabId: genId("tab"), pageId: userId, workspaceId: "", kind: "profile", title: name ?? "Profile", icon: "icon:user" };
}

/** The unified messaging inbox tab (DMs + groups in one two-pane surface). */
export function messagesTab(): WorkspaceTab {
  return { tabId: genId("tab"), pageId: MESSAGES_TAB_ID, workspaceId: "", kind: "messages", title: "Messages", icon: "icon:message-square" };
}

/** The "Discover" tab — browse joinable projects / collaborations. */
export function collabTab(): WorkspaceTab {
  return { tabId: genId("tab"), pageId: COLLAB_TAB_ID, workspaceId: "", kind: "collab", title: "Discover", icon: "icon:compass" };
}

/** The AI Chat Shell tab — multi-model assistant (one surface; conversations live inside). */
export function chatTab(): WorkspaceTab {
  return { tabId: genId("tab"), pageId: CHAT_TAB_ID, workspaceId: "", kind: "chat", title: "Assistant", icon: "icon:bot" };
}

/** The Communities tab — browse communities and their channels. */
export function communityTab(): WorkspaceTab {
  return { tabId: genId("tab"), pageId: COMMUNITY_TAB_ID, workspaceId: "", kind: "community", title: "Communities", icon: "icon:users" };
}

/** A single pane with just the Home tab — the default and the empty-tree reset. */
export function freshLayout(): { root: PaneNode; activePaneId: string } {
  const tab = homeTab();
  const pane: PaneNode = { type: "pane", id: genId("pane"), tabs: [tab], activeTabId: tab.tabId };
  return { root: pane, activePaneId: pane.id };
}

export function loadLayout(userId: string = currentUserId()): { root: LayoutNode; activePaneId: string } {
  // No window (SSR/tests) OR no signed-in user yet → a clean layout. Returning fresh
  // when the user is unknown is what stops a DIFFERENT account's persisted tabs from
  // ever showing before usePageSync restores the correct per-user layout.
  if (globalThis.window === undefined || !userId) return freshLayout();
  try {
    const raw = globalThis.localStorage.getItem(layoutKey(userId));
    if (!raw) return freshLayout();
    const parsed = JSON.parse(raw) as { root?: LayoutNode; activePaneId?: string };
    if (!parsed?.root || !parsed.activePaneId) return freshLayout();
    return { root: parsed.root, activePaneId: parsed.activePaneId };
  } catch {
    return freshLayout();
  }
}

export function saveLayout(state: { root: LayoutNode; activePaneId: string }, userId: string = currentUserId()): void {
  if (globalThis.window === undefined) return;
  try {
    globalThis.localStorage.setItem(layoutKey(userId), JSON.stringify({ root: state.root, activePaneId: state.activePaneId }));
  } catch {
    /* ignore storage quota / privacy-mode errors */
  }
}

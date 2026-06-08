/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageToTab.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { ActivePage, PageEntry } from "@/entities/page";
import { genId, type TabKind, type WorkspaceTab } from "./layoutTree";

/** Build a tab descriptor from a stored page (sidebar drop / programmatic open). */
export function pageEntryToTab(
  page: Pick<PageEntry, "_id" | "workspaceId" | "title" | "icon" | "surface" | "databaseId">,
): WorkspaceTab {
  const kind: TabKind = page.surface === "folder" ? "folder" : page.databaseId ? "database" : "page";
  return {
    tabId: genId("tab"),
    pageId: page._id,
    workspaceId: page.workspaceId,
    kind,
    title: page.title,
    icon: page.icon ?? undefined,
    databaseId: page.databaseId ?? null,
  };
}

/** Build a tab descriptor from the legacy ActivePage shape (openPage handoff). */
export function activePageToTab(page: ActivePage): WorkspaceTab {
  const kind: TabKind = page.kind === "home" ? "home" : page.kind;
  return {
    tabId: genId("tab"),
    pageId: page.id,
    workspaceId: page.workspaceId,
    kind,
    title: page.title,
    icon: page.icon,
    databaseId: page.databaseId ?? null,
  };
}

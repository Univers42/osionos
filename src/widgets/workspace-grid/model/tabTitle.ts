/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tabTitle.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect } from "react";

import { usePageStore } from "@/store/usePageStore";
import { activeTabOf, type WorkspaceTab } from "./layoutTree";
import { useWorkspaceLayout } from "./workspaceLayout";

const APP_NAME = "osionos";

/** The live page title for a page tab (renames show at once), the tab's own title otherwise. */
export function useTabTitle(tab: WorkspaceTab | null): string {
  const pageTitle = usePageStore((s) => (tab?.kind === "page" ? s.pageById(tab.pageId)?.title : undefined));
  return pageTitle || tab?.title || "Untitled";
}

/** The browser tab and screen-reader window title follow the focused pane's tab (RGAA 8.6, #224). */
export function useDocumentTitle(): void {
  const tab = useWorkspaceLayout((s) => activeTabOf(s.root, s.activePaneId));
  const title = useTabTitle(tab);
  useEffect(() => {
    document.title = tab ? `${title} — ${APP_NAME}` : APP_NAME;
  }, [tab, title]);
}

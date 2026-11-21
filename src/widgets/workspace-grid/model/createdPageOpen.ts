/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   createdPageOpen.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Where a page lands once its create resolves. The create is a round trip; if the
// user moved meanwhile, opening it would replace whatever they now look at (#339),
// so it becomes a background tab and a toast offers to open it.

import type { ActivePage } from "@/entities/page";
import { useUIStore, type ActivePanel } from "@/shared/config/uiStore";
import { usePageStore } from "@/store/usePageStore";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";

import { findPane } from "./layoutTree";
import { activePageToTab } from "./pageToTab";
import { useWorkspaceLayout } from "./workspaceLayout";

/** What the user was looking at when the create started. */
export interface OpenOrigin {
  scope: string;
  paneId: string;
  tabId: string | null;
  panel: ActivePanel;
}

/** Call before the create's first await. `open` false means "do not open": null. */
export function captureOpenOrigin(open = true): OpenOrigin | null {
  if (!open) return null;
  const { root, activePaneId, scope } = useWorkspaceLayout.getState();
  const tabId = findPane(root, activePaneId)?.activeTabId ?? null;
  return { scope, paneId: activePaneId, tabId, panel: useUIStore.getState().activePanel };
}

// Caveat: "still there" compares identities, not what is on screen. Leaving and
// coming back before the create resolves counts as still there, and so the page opens.
function isStillOn(origin: OpenOrigin): boolean {
  const now = captureOpenOrigin();
  return now !== null && now.scope === origin.scope && now.paneId === origin.paneId
    && now.tabId === origin.tabId && now.panel === origin.panel;
}

/** Open the created page where the create started, or tab it in the background. */
export function openCreatedPage(page: ActivePage, origin: OpenOrigin | null): void {
  if (!origin) return;
  if (isStillOn(origin)) return usePageStore.getState().openPage(page);
  const layout = useWorkspaceLayout.getState();
  // Another user's or workspace's layout must never receive this page's tab.
  if (layout.scope !== origin.scope) {
    useToastStore.getState().push({ kind: "success", title: "Page created" });
    return;
  }
  layout.openBackgroundTab(activePageToTab(page), origin.paneId);
  const open = () => usePageStore.getState().openPage(page);
  useToastStore.getState().push({ kind: "success", title: "Page created", action: { label: "Open", onClick: open } });
}

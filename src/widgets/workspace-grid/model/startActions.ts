/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   startActions.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 05:10:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 05:10:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// What the empty workspace offers (and the "New page" shortcut runs): start a
// page or a folder in the active workspace, or open Home. Private, like the
// sidebar's Private "+", because nobody asked to share it yet.

import { useUserStore } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";

import { homeTab } from "./layoutPersist";
import { useWorkspaceLayout } from "./workspaceLayout";

function activeWorkspace(): { workspaceId: string; jwt: string } | null {
  const users = useUserStore.getState();
  const workspaceId = users.activeWorkspace()?._id ?? "";
  return workspaceId ? { workspaceId, jwt: users.activePageJwt() ?? "" } : null;
}

export async function startNewPage(): Promise<void> {
  const target = activeWorkspace();
  if (!target) return;
  const page = await usePageStore.getState().addPage(target.workspaceId, "Untitled", target.jwt, undefined, { visibility: "private" });
  if (page) usePageStore.getState().openPage({ id: page._id, workspaceId: target.workspaceId, kind: "page", title: page.title });
}

export async function startNewFolder(): Promise<void> {
  const target = activeWorkspace();
  if (!target) return;
  // A folder never opens; say where it went so the click is not lost.
  const folder = await usePageStore.getState().addPage(target.workspaceId, "New folder", target.jwt, undefined, { surface: "folder", visibility: "private" });
  if (folder) useToastStore.getState().push({ kind: "success", title: "Folder created", description: "It is in Private, in the sidebar." });
}

export function openHome(): void {
  const layout = useWorkspaceLayout.getState();
  layout.openTab(homeTab(), layout.activePaneId);
}

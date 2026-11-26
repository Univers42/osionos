/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   newPageAction.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useUserStore } from "@/features/auth";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";
import { usePageStore } from "@/store/usePageStore";
import { captureOpenOrigin, openCreatedPage } from "@/widgets/workspace-grid/model/createdPageOpen";

/**
 * Create a page (or, with `surface`, a folder) in the active workspace and open
 * it. A no-op without an active workspace. A folder is announced with a toast
 * rather than opened.
 */
export function createPage(title: string, surface?: "folder"): void {
  const user = useUserStore.getState();
  const workspace = user.activeWorkspace();
  const jwt = user.activePageJwt() ?? "";
  if (!workspace) return;
  const options = surface ? { surface } : undefined;
  const origin = captureOpenOrigin(!surface);
  void usePageStore.getState().addPage(workspace._id, title, jwt, undefined, options).then((page) => {
    if (!page) return;
    if (surface) useToastStore.getState().push({ kind: "success", title: "Folder created" });
    else openCreatedPage({ id: page._id, workspaceId: workspace._id, kind: "page", title: page.title }, origin);
  });
}

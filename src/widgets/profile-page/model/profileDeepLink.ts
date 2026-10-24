/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profileDeepLink.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The ?u=<username> boot link: resolve the username through the public card, open that
 * member's profile tab, and drop the param so a reload does not reopen it.
 *
 * Caveat: a username that does not resolve (unknown, or the card is refused) opens nothing
 * and still drops the param; the link is one-shot, not retried.
 */

import { whenLayoutIsRestored } from "@/features/settings/model/settingsDeepLink";
import { api, getActivePageJwt } from "@/shared/api/client";
import { profileTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { readProfileLinkUsername } from "./profileLinkParam";

function dropProfileParam(): void {
  const { pathname, search, hash } = globalThis.location;
  const params = new URLSearchParams(search);
  params.delete("u");
  const query = params.toString();
  globalThis.history.replaceState(globalThis.history.state, "", `${pathname}${query ? `?${query}` : ""}${hash}`);
}

async function openProfileOf(username: string): Promise<void> {
  const jwt = getActivePageJwt();
  if (!jwt) return;
  try {
    const card = await api.get<{ userId?: string; displayName?: string }>(`/api/users/${encodeURIComponent(username)}`, jwt);
    if (typeof card.userId !== "string" || card.userId === "") return;
    useWorkspaceLayout.getState().openTab(profileTab(card.userId, card.displayName ?? `@${username}`));
  } catch {
    // The page it points at does not exist or is not visible: nothing to open.
  }
}

export function applyProfileDeepLink(): void {
  const username = readProfileLinkUsername(globalThis.location?.search ?? "");
  if (!username) return;
  whenLayoutIsRestored(() => {
    dropProfileParam();
    void openProfileOf(username);
  });
}

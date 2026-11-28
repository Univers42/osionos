/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sessionBootstrap.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/12 23:14:08 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import { useUserStore } from "@/features/auth/model/useUserStore";
import { isBridgeSession } from "@/features/auth/model/userStore.helpers";
import { usePageStore } from "@/store/usePageStore";
import { ensureBridgeWorkspacePages, seedEmptyOnlineWorkspaces } from "./workspaceBootstrap";

/**
 * Loads the signed-in accounts' pages once `init()` has resolved: the bridge workspaces, the
 * offline seed, or the server seed for empty online workspaces. Does nothing when `init()`
 * returned early (another run still in progress), so sessions are never read half-filled.
 */
export async function bootstrapSessions(): Promise<void> {
  const state = useUserStore.getState();
  if (!state.initialized) return;

  const { sessions, activeUserId } = state;
  const session = sessions[activeUserId];
  const jwt = state.activePageJwt() ?? "";

  if (!jwt) {
    if (isBridgeSession(session)) {
      ensureBridgeWorkspacePages(session);
      return;
    }
    usePageStore.getState().seedOfflinePages();
    return;
  }

  await seedEmptyOnlineWorkspaces(sessions, jwt);
}

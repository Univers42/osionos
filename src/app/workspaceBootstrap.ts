/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceBootstrap.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { UserSession } from "@/entities/user";
import { useUserStore } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";
import { derivePageState, savePagesCache, saveRecents } from "@/store/pageStore.helpers";

export type UserSessions = Record<string, UserSession>;

export function ensureBridgeWorkspacePages(session: UserSession | null | undefined) {
  const workspaceIds = [
    ...(session?.privateWorkspaces ?? []),
    ...(session?.sharedWorkspaces ?? []),
  ].map((workspace) => workspace._id);
  const allowedWorkspaceIds = new Set(workspaceIds);

  usePageStore.setState((pageState) => {
    const pages = Object.fromEntries(
      workspaceIds.map((workspaceId) => [workspaceId, pageState.pages[workspaceId] ?? []]),
    );
    const recents = pageState.recents.filter((recent) => allowedWorkspaceIds.has(recent.workspaceId));
    const activePage = pageState.activePage && allowedWorkspaceIds.has(pageState.activePage.workspaceId)
      ? pageState.activePage
      : null;
    const navigationPath = pageState.navigationPath.filter((page) => allowedWorkspaceIds.has(page.workspaceId));

    for (const workspaceId of workspaceIds) {
      pages[workspaceId] = pages[workspaceId] ?? [];
    }
    savePagesCache(pages);
    saveRecents(recents);
    return {
      ...derivePageState(pages, pageState.pageIdsByWorkspace),
      recents,
      activePage,
      navigationPath,
      seeded: true,
      showTrash: false,
    };
  });
}

function uniqueSessionWorkspaces(sessions: UserSessions) {
  const seen = new Set<string>();
  return Object.values(sessions)
    .flatMap((session) => [...session.privateWorkspaces, ...session.sharedWorkspaces])
    .filter((workspace) => {
      if (seen.has(workspace._id)) return false;
      seen.add(workspace._id);
      return true;
    });
}

export async function seedEmptyOnlineWorkspaces(sessions: UserSessions, jwt: string) {
  const uniqueWorkspaces = uniqueSessionWorkspaces(sessions);
  // usePageSync's hydrate is the canonical pull for every accessible workspace; don't
  // duplicate it. Read the store (hydrate populates it) and only fetch workspaces that
  // still look empty — either genuinely empty (need a server-confirmed pull before we seed)
  // or not yet hydrated. fetchPages' TTL de-thrashes any overlap with a concurrent
  // sidebar/files-panel mount and with seedOnlinePages' own per-workspace re-check.
  const emptyWorkspaces = uniqueWorkspaces.filter(
    (workspace) => (usePageStore.getState().pages[workspace._id] ?? []).length === 0,
  );
  if (emptyWorkspaces.length > 0) {
    await Promise.all(
      emptyWorkspaces.map((workspace) => usePageStore.getState().fetchPages(workspace._id, jwt)),
    );
  }

  const pages = usePageStore.getState().pages;
  const anyEmpty = uniqueWorkspaces.some(
    (workspace) => (pages[workspace._id] ?? []).length === 0,
  );
  if (!anyEmpty) return;

  const personas = useUserStore.getState().personas;
  const workspaceMap: Record<string, string> = {};

  for (let index = 0; index < personas.length; index++) {
    const persona = personas[index];
    const personaSession = sessions[persona.id];
    if (!personaSession) continue;
    const privateWorkspace = personaSession.privateWorkspaces[0];
    if (privateWorkspace) workspaceMap[`mock-ws-private-${index}`] = privateWorkspace._id;
    const sharedWorkspace = personaSession.sharedWorkspaces[0];
    if (sharedWorkspace) workspaceMap["mock-ws-shared-team"] = sharedWorkspace._id;
  }

  await usePageStore.getState().seedOnlinePages(workspaceMap, jwt);
}

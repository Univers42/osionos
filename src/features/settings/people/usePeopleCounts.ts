/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePeopleCounts.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Real tab counts for the People panel — replaces the stub zeros. Members and
 *  guests come reactively from their settings stores; contacts and groups are
 *  fetched (re-run when `nonce` changes after a write). */

import { useEffect, useMemo, useState } from "react";
import { listConnections } from "@/shared/social/connectionApi";
import { fetchChannels } from "@/shared/chat/channelApi";
import { listCommunities } from "@/shared/social/communityApi";
import { useWorkspaceInvitesStore, useWorkspaceMembersStore } from "@/store/settings";

export interface PeopleCounts {
  contacts: number;
  groups: number;
  guests: number;
  members: number;
}

export function usePeopleCounts(workspaceId: string, nonce: number): PeopleCounts {
  const members = useWorkspaceMembersStore((state) => state.data[workspaceId]?.length ?? 0);
  const guests = useWorkspaceInvitesStore((state) => (state.data[workspaceId] ?? []).filter((invite) => !invite.revokedAt).length);
  const [remote, setRemote] = useState({ contacts: 0, groups: 0 });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [connections, channels, communities] = await Promise.all([
        listConnections({ status: "accepted" }).catch(() => []),
        fetchChannels(workspaceId).catch(() => []),
        listCommunities().catch(() => []),
      ]);
      if (!alive) return;
      const groups = channels.filter((channel) => channel.kind === "group").length + communities.length;
      setRemote({ contacts: connections.length, groups });
    })();
    return () => { alive = false; };
  }, [workspaceId, nonce]);

  return useMemo(
    () => ({ contacts: remote.contacts, groups: remote.groups, guests, members }),
    [remote, guests, members],
  );
}

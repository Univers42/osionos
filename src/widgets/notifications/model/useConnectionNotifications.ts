/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useConnectionNotifications.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Live connection-notification glue for the activity-rail bell. Re-hydrates the
 * contacts inbox whenever the bridge publishes a connection event to this user's
 * realtime topic (`user:<id>` — see bridge-social.mjs createConnection /
 * patchConnection), and applies `workspace_membership` events: the workspace
 * lists are re-fetched so a newly shared space appears in the switcher without a
 * reload, with a toast; a removal from the active workspace switches back to the
 * user's own one. Inert (no-op disposer) when realtime is off — the panel still
 * hydrates on open. Also exposes the incoming-invitation count that drives the
 * badge.
 */

import { useEffect } from 'react';

import { subscribeTopic } from '@/services/realtime-messages/wsTransport';
import { useContactsStore } from '@/store/social/useContactsStore';
import { useUserStore } from '@/features/auth/model/useUserStore';
import {
  fetchWorkspaces,
  pageApiJwtFromSessionToken,
  partition,
} from '@/features/auth/model/userStore.helpers';
import { useToastStore } from '@osionos/ui/primitives/useToastStore';
import { workspaceMembershipNotice, type WorkspaceMembershipPayload } from './workspaceMembershipNotice';

/** Re-read /api/workspaces and replace the session's lists (bridge sessions included). */
async function refreshWorkspaceLists(userId: string): Promise<void> {
  const session = useUserStore.getState().sessions[userId];
  if (!session) return;
  try {
    const workspaces = await fetchWorkspaces(pageApiJwtFromSessionToken(session.accessToken));
    // An unreachable bridge answers [] too; never wipe a good list from a failed read.
    if (workspaces.length === 0) return;
    const { privateWorkspaces, sharedWorkspaces } = partition(workspaces, userId);
    useUserStore.setState((state) => {
      const current = state.sessions[userId];
      if (!current) return state;
      return { sessions: { ...state.sessions, [userId]: { ...current, privateWorkspaces, sharedWorkspaces } } };
    });
  } catch {
    /* best-effort: the next membership event or reload retries */
  }
}

/** A removal from the space currently open falls back to the user's own workspace. */
function leaveRemovedWorkspace(userId: string, workspaceId: string | undefined): void {
  if (!workspaceId) return;
  const state = useUserStore.getState();
  if (state.activeWorkspaceByUser[userId] !== workspaceId) return;
  const own = state.sessions[userId]?.privateWorkspaces[0]?._id;
  if (own) state.switchWorkspace(own);
}

export function useConnectionNotifications(): void {
  const activeUserId = useUserStore((s) => s.activeUserId);
  useEffect(() => {
    if (!activeUserId) return undefined;
    void useContactsStore.getState().hydrate();
    return subscribeTopic(`user:${activeUserId}`, (frame) => {
      if (frame.event_type === 'workspace_membership') {
        const payload = (frame.payload ?? {}) as WorkspaceMembershipPayload;
        void refreshWorkspaceLists(activeUserId).then(() => {
          if (payload.op === 'removed') leaveRemovedWorkspace(activeUserId, payload.workspaceId);
        });
        const notice = workspaceMembershipNotice(payload);
        if (notice) {
          useToastStore.getState().push({ kind: payload.op === 'removed' ? 'info' : 'success', title: notice });
        }
        return;
      }
      void useContactsStore.getState().hydrate();
    });
  }, [activeUserId]);
}

/** Count of incoming pending invitations — the rail bell badge. */
export function useIncomingInviteCount(): number {
  return useContactsStore((s) => s.requests.filter((edge) => edge?.direction === 'incoming').length);
}

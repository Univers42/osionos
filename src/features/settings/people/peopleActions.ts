/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   peopleActions.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Every People write reuses an EXISTING bridge client or settings store —
 *  grobase already provides the CRUD, so nothing here re-implements it. */

import { createConnection, removeConnection } from "@/shared/social/connectionApi";
import { createChannel, openDm } from "@/shared/chat/channelApi";
import { createCommunity } from "@/shared/social/communityApi";
import { useWorkspaceInvitesStore, useWorkspaceMembersStore, type WorkspaceMemberRole } from "@/store/settings";
import { errorCode, trySettingsPost } from "@/store/settings/settingsStoreUtils";

/** Connect to a directory person (LinkedIn-style request). */
export function connectPerson(personId: string): Promise<unknown> {
  return createConnection(personId);
}

/** Remove an accepted connection (contacts row id === connection id). */
export function removeContact(connectionId: string): Promise<void> {
  return removeConnection(connectionId);
}

/** Open (find-or-create) the 1:1 DM channel with a peer. */
export function messagePerson(peerId: string, workspaceId?: string): Promise<unknown> {
  return openDm(peerId, workspaceId);
}

/** Create a new group — a group chat channel or a community. */
export function createGroup(workspaceId: string, name: string, kind: "chat" | "community"): Promise<unknown> {
  // A moderation warning on a community rejects like any error here: this
  // action has no room for a notice, so the author answers it in the modal.
  if (kind === "community") return createCommunity({ name });
  return createChannel({ workspaceId, name, kind: "group" });
}

/** Invite a guest by email (reuses the workspace-invites store). */
export function inviteGuest(workspaceId: string, email: string, role: Exclude<WorkspaceMemberRole, "owner">, invitedBy: string): Promise<{ _id: string } | null> {
  return useWorkspaceInvitesStore.getState().invite(workspaceId, { email, role, invitedBy });
}

/** What POST /api/collaboration/:id/invite answers — only `ok` and the one-time
 *  link are read here; the legacy keys (role, inviteId, pending…) belong to the bridge. */
interface CollabInviteReply { ok?: boolean; acceptUrl?: string }

/** Invite a connection to the workspace by user id — the collaboration route, i.e. the
 *  same create path as the email invite minus the address lookup (C513/C653). The bridge
 *  refuses a non-connection, and its message + code (not_connected, already_member…) are
 *  what the peek shows, so they are re-thrown instead of being swallowed here. */
export async function inviteContact(
  workspaceId: string,
  userId: string,
  role: Exclude<WorkspaceMemberRole, "owner">,
): Promise<{ acceptUrl: string | null }> {
  try {
    const remote = await trySettingsPost<CollabInviteReply>(
      `/api/collaboration/${encodeURIComponent(workspaceId)}/invite`,
      { userId, role },
    );
    if (!remote?.ok) throw new Error("The invite was not created.");
    // The pending invite must appear in Guests without a manual refresh; the reply already
    // carries the link, so the re-read runs detached and never delays the flow.
    void useWorkspaceInvitesStore.getState().hydrate(workspaceId);
    return { acceptUrl: remote.acceptUrl ?? null };
  } catch (error) {
    throw Object.assign(
      new Error(error instanceof Error ? error.message : "Could not send the invite."),
      { code: errorCode(error) },
    );
  }
}

/** Revoke an invite (guest row id === invite id). */
export function revokeGuest(workspaceId: string, inviteId: string): Promise<void> {
  return useWorkspaceInvitesStore.getState().revoke(workspaceId, inviteId);
}

/** Change a member's role (excludes ownership transfer — see transferOwnership). */
export function changeMemberRole(workspaceId: string, userId: string, role: WorkspaceMemberRole): Promise<void> {
  return useWorkspaceMembersStore.getState().changeRole(workspaceId, userId, role);
}

/** Remove a member from the workspace (members row id === userId). */
export function removeMember(workspaceId: string, userId: string): Promise<void> {
  return useWorkspaceMembersStore.getState().remove(workspaceId, userId);
}

/** Transfer ownership to another member (the destructive owner cutover). */
export async function transferOwnership(workspaceId: string, userId: string): Promise<void> {
  const store = useWorkspaceMembersStore.getState();
  await store.transferOwnership(workspaceId, userId);
  // The store reverts and records `error` instead of rejecting, so a refusal (sudo, not the
  // owner) would otherwise look like success to the caller.
  const after = useWorkspaceMembersStore.getState();
  const transferred = after.data[workspaceId]?.some((member) => member.userId === userId && member.role === "owner");
  if (!transferred) throw Object.assign(new Error(after.error[workspaceId] ?? "Could not transfer ownership"), { code: after.errorCode[workspaceId] ?? undefined });
}

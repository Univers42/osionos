/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   peopleActions.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Every People write reuses an EXISTING bridge client or settings store —
 *  grobase already provides the CRUD, so nothing here re-implements it. */

import { createConnection, removeConnection } from "@/shared/social/connectionApi";
import { createChannel, openDm } from "@/shared/chat/channelApi";
import { createCommunity } from "@/shared/social/communityApi";
import { useWorkspaceInvitesStore, useWorkspaceMembersStore, type WorkspaceMemberRole } from "@/store/settings";

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
  if (kind === "community") return createCommunity({ name });
  return createChannel({ workspaceId, name, kind: "group" });
}

/** Invite a guest by email (reuses the workspace-invites store). */
export function inviteGuest(workspaceId: string, email: string, role: Exclude<WorkspaceMemberRole, "owner">, invitedBy: string): Promise<unknown> {
  return useWorkspaceInvitesStore.getState().invite(workspaceId, { email, role, invitedBy });
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
export function transferOwnership(workspaceId: string, userId: string): Promise<void> {
  return useWorkspaceMembersStore.getState().transferOwnership(workspaceId, userId);
}

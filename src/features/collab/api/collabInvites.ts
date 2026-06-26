/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collabInvites.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 19:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 19:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Client wrappers for the Shared-space invite flow (AOC §invites) — thin glue
 * over the EXISTING owner-gated bridge endpoints (join-requests + the new direct
 * invite). Authorization is the bridge's job (owner-only); this layer only
 * shapes requests/replies. Connections come from the existing social graph.
 */

import { api, getActivePageJwt } from '@/shared/api/client';
import type { JoinRequest } from '../model/inviteState';

export type { JoinRequest };

function jwt(): string | undefined {
  return getActivePageJwt() ?? undefined;
}

/** Pending join-requests for a space the caller owns (owner-only at the bridge). */
export async function listJoinRequests(spaceId: string): Promise<JoinRequest[]> {
  const reply = await api.get<{ ok: boolean; requests?: JoinRequest[] }>(
    `/api/workspaces/${encodeURIComponent(spaceId)}/join-requests`, jwt());
  return Array.isArray(reply.requests) ? reply.requests : [];
}

/** Approve or deny a pending join-request (owner-only at the bridge). */
export async function decideJoinRequest(requestId: string, action: 'approve' | 'deny'): Promise<void> {
  await api.patch(`/api/join-requests/${encodeURIComponent(requestId)}`, { action }, jwt());
}

/** Directly invite a connection into the space (owner-only at the bridge). */
export async function inviteMember(spaceId: string, userId: string): Promise<void> {
  await api.post(`/api/collaboration/${encodeURIComponent(spaceId)}/invite`, { userId }, jwt());
}

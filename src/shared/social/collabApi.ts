/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collabApi.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Bridge collaboration / workspace-discovery endpoints. */

import { api, getActivePageJwt } from '@/shared/api/client';

export type WorkspaceVisibility = 'confidential' | 'request_to_join' | 'public';
export type JoinState = 'none' | 'member' | 'requested';

export interface CollabWorkspace {
  id: string;
  name: string;
  slug: string;
  visibility: WorkspaceVisibility;
  memberCount: number;
  owner: { id: string; name: string } | null;
  entryPageId: string | null;
  joinState: JoinState;
}

export interface JoinRequest {
  id: string;
  workspaceId: string;
  requester: { id: string; name: string; avatar: string | null };
  message: string | null;
  createdAt: string;
}

function jwt(): string | undefined {
  return getActivePageJwt() ?? undefined;
}

export async function listCollaboration(query?: string): Promise<CollabWorkspace[]> {
  const search = query ? `?query=${encodeURIComponent(query)}` : '';
  const reply = await api.get<{ workspaces: CollabWorkspace[] }>(`/api/collaboration${search}`, jwt());
  return Array.isArray(reply.workspaces) ? reply.workspaces : [];
}

export async function getCollaboration(id: string): Promise<CollabWorkspace | null> {
  const reply = await api.get<{ workspace?: CollabWorkspace }>(
    `/api/collaboration/${encodeURIComponent(id)}`,
    jwt(),
  );
  return reply.workspace ?? null;
}

export async function joinCollaboration(id: string, message?: string): Promise<void> {
  await api.post(`/api/collaboration/${encodeURIComponent(id)}/join`, { message }, jwt());
}

export async function setWorkspaceVisibility(id: string, visibility: WorkspaceVisibility): Promise<void> {
  await api.patch(`/api/workspaces/${encodeURIComponent(id)}`, { visibility }, jwt());
}

export async function listJoinRequests(workspaceId: string): Promise<JoinRequest[]> {
  const reply = await api.get<{ requests: JoinRequest[] }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/join-requests`,
    jwt(),
  );
  return Array.isArray(reply.requests) ? reply.requests : [];
}

export async function resolveJoinRequest(id: string, action: 'approve' | 'deny'): Promise<void> {
  await api.patch(`/api/join-requests/${encodeURIComponent(id)}`, { action }, jwt());
}

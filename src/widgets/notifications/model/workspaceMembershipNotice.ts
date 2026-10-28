/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceMembershipNotice.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Pure copy for a `workspace_membership` realtime frame — no React, no store. */

export interface WorkspaceMembershipPayload {
  workspaceId?: string;
  workspaceName?: string;
  role?: string;
  op?: 'added' | 'role' | 'removed' | 'member_joined';
  by?: { userId?: string; name?: string };
  member?: { userId?: string; name?: string };
}

/** The toast copy for a membership frame, or null for ops with nothing to say. */
export function workspaceMembershipNotice(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const event = payload as WorkspaceMembershipPayload;
  const workspace = event.workspaceName || 'a workspace';
  if (event.op === 'added') return `${event.by?.name || 'Someone'} added you to ${workspace}`;
  if (event.op === 'removed') return `You were removed from ${workspace}`;
  if (event.op === 'member_joined') return `${event.member?.name || 'Someone'} joined ${workspace}`;
  return null;
}

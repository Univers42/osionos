/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inviteState.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 19:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 19:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pure projections for the Shared-space invite surface (AOC §invites). Decides
 * which of the owner's connections are still invitable (not already members /
 * not already requested) and orders pending requests for a calm list. No I/O.
 */

/** A pending request to join a Shared space (data shape; the api layer fetches it). */
export interface JoinRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterAvatar?: string | null;
  message?: string | null;
  createdAt?: string | null;
}

export interface Connection { userId: string; name: string; avatar?: string | null; }

/**
 * Connections eligible to invite: those who are not already members and have no
 * pending request (which the owner would approve instead of inviting).
 */
export function invitableConnections(
  connections: Connection[], memberIds: Iterable<string>, pending: JoinRequest[],
): Connection[] {
  const blocked = new Set<string>(memberIds);
  for (const request of pending) blocked.add(request.requesterId);
  const seen = new Set<string>();
  return connections.filter((connection) => {
    if (blocked.has(connection.userId) || seen.has(connection.userId)) return false;
    seen.add(connection.userId);
    return true;
  });
}

/** Pending requests oldest-first (FIFO is the fair order to action a queue). */
export function pendingInOrder(requests: JoinRequest[]): JoinRequest[] {
  return [...requests].sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
}

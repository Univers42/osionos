/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   types.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Shared social-graph types (connections, blocks, reports). */

export type ConnectionStatus = 'pending' | 'accepted' | 'declined' | 'blocked';
export type ConnectionDirection = 'incoming' | 'outgoing' | 'all';

export interface ContactPeer {
  id: string;
  name: string;
  avatar: string | null;
  headline?: string | null;
  online?: boolean;
}

/** One edge of the connection graph (bridge `/api/connections`). */
export interface ContactEdge {
  id: string;
  peer: ContactPeer;
  status: ConnectionStatus;
  direction: ConnectionDirection;
  introMessage: string | null;
  createdAt: string;
}

export interface BlockedUser {
  userId: string;
  name?: string | null;
  avatar?: string | null;
  reason?: string | null;
  createdAt?: string;
}

export type ReportSubjectKind = 'user' | 'message' | 'page' | 'workspace' | 'channel';

export interface ReportPayload {
  subjectUserId?: string;
  subjectKind: ReportSubjectKind;
  subjectId?: string;
  category: string;
  details?: string;
}

export interface Report extends ReportPayload {
  id: string;
  status?: string;
  createdAt?: string;
}

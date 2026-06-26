/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   connectionApi.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Bridge connection endpoints (scripts/bridge-social-core.mjs contract). */

import { api, getActivePageJwt } from '@/shared/api/client';
import type { ContactEdge, ConnectionDirection, ConnectionStatus } from '@/store/social/types';

type TransitionAction = 'accept' | 'decline' | 'withdraw';

function jwt(): string | undefined {
  return getActivePageJwt() ?? undefined;
}

export async function listConnections(opts?: {
  status?: ConnectionStatus;
  direction?: ConnectionDirection;
}): Promise<ContactEdge[]> {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.direction) params.set('direction', opts.direction);
  const search = params.toString() ? `?${params}` : '';
  const reply = await api.get<{ connections: ContactEdge[] }>(`/api/connections${search}`, jwt());
  return Array.isArray(reply.connections) ? reply.connections : [];
}

export async function createConnection(addresseeId: string, introMessage?: string): Promise<ContactEdge> {
  const reply = await api.post<{ connection: ContactEdge }>(
    '/api/connections',
    { addresseeId, introMessage },
    jwt(),
  );
  return reply.connection;
}

export async function transitionConnection(id: string, action: TransitionAction): Promise<ContactEdge | null> {
  const reply = await api.patch<{ connection?: ContactEdge }>(
    `/api/connections/${encodeURIComponent(id)}`,
    { action },
    jwt(),
  );
  return reply.connection ?? null;
}

export async function removeConnection(id: string): Promise<void> {
  await api.delete(`/api/connections/${encodeURIComponent(id)}`, jwt());
}

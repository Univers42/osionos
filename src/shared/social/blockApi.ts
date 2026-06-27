/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockApi.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Bridge block-list endpoints (/api/social/blocks). */

import { api, getActivePageJwt } from '@/shared/api/client';
import type { BlockedUser } from '@/store/social/types';

function jwt(): string | undefined {
  return getActivePageJwt() ?? undefined;
}

export async function listBlocks(): Promise<BlockedUser[]> {
  const reply = await api.get<{ blocks: BlockedUser[] }>('/api/social/blocks', jwt());
  return Array.isArray(reply.blocks) ? reply.blocks : [];
}

export async function blockUser(userId: string, reason?: string): Promise<BlockedUser | null> {
  const reply = await api.post<{ block?: BlockedUser }>('/api/social/blocks', { userId, reason }, jwt());
  return reply.block ?? null;
}

export async function unblockUser(userId: string): Promise<void> {
  await api.delete(`/api/social/blocks/${encodeURIComponent(userId)}`, jwt());
}

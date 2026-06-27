/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useConversationFilter.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pure filter/search over the conversation list (WhatsApp-style pills):
 * All / Unread / Groups + a free-text name query. No network, no store —
 * just a memoized derivation the panel can drive off local state.
 */

import { useMemo } from 'react';

import type { Conversation } from './useConversations';

export type ConversationScope = 'all' | 'unread' | 'groups';

function matchesScope(convo: Conversation, scope: ConversationScope): boolean {
  if (scope === 'unread') return convo.unread > 0;
  if (scope === 'groups') return convo.channel.kind === 'group';
  return true;
}

function matchesQuery(convo: Conversation, needle: string): boolean {
  if (!needle) return true;
  return convo.channel.name.toLowerCase().includes(needle);
}

export function filterConversations(
  conversations: Conversation[],
  scope: ConversationScope,
  query: string,
): Conversation[] {
  const needle = query.trim().toLowerCase();
  return conversations.filter((convo) => matchesScope(convo, scope) && matchesQuery(convo, needle));
}

export function useConversationFilter(
  conversations: Conversation[],
  scope: ConversationScope,
  query: string,
): Conversation[] {
  return useMemo(
    () => filterConversations(conversations, scope, query),
    [conversations, scope, query],
  );
}

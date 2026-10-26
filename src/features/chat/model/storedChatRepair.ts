/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   storedChatRepair.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Before aiWire.ts, conversations synced from the service were stored without
// createdAt/updatedAt; the Conversations panel threw on its sort at every load
// (live, 2026-10-26). Such a mirror is dropped with its messages: the next sync
// adds it again, read correctly.

import type { ChatMessage, Conversation } from "./chatTypes";

export function withoutUnreadableMirrors<T extends { conversations: Conversation[]; messages: ChatMessage[] }>(data: T): T {
  const broken = new Set(data.conversations
    .filter((c) => c.serverConversationId && typeof c.updatedAt !== "string")
    .map((c) => c.id));
  if (broken.size === 0) return data;
  return {
    ...data,
    conversations: data.conversations.filter((c) => !broken.has(c.id)),
    messages: data.messages.filter((m) => !broken.has(m.conversationId)),
  };
}

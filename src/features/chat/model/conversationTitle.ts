/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   conversationTitle.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The title of a conversation.
 *
 * A conversation starts with the default title, and the service sets the real
 * one from the first question. The client takes that title — but NEVER over a
 * title the reader renamed: a name the reader chose is theirs.
 */

/** The title a conversation has until the service gives it one. */
export const DEFAULT_CONVERSATION_TITLE = "New conversation";

/** True when the conversation still carries the title it was born with. */
export function isDefaultConversationTitle(title: string): boolean {
  const trimmed = title.trim();
  return trimmed === "" || trimmed === DEFAULT_CONVERSATION_TITLE;
}

/**
 * The title a conversation shows after the service named it.
 *
 * The server's title wins only over the default one. A title the reader
 * renamed stays, whatever the service says.
 */
export function resolveConversationTitle(current: string, serverTitle: string | undefined): string {
  if (!isDefaultConversationTitle(current)) return current;
  const incoming = (serverTitle ?? "").trim();
  return incoming || current;
}

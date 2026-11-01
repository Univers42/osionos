/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   historyCatchUp.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { ChatMessage } from '@/shared/chat/messageApi';

/** The id of a message this tab is still sending: the optimistic row of `channelWrites`. */
export const PENDING_MESSAGE_PREFIX = 'temp-';

const isPending = (message: ChatMessage) => message.id.startsWith(PENDING_MESSAGE_PREFIX);

/**
 * The channel after it re-read its latest page of history on a reconnect (#172). The
 * server is the truth for what that page covers — messages, edits and deletions of the
 * gap. Older messages stay, since the view cannot load them again, and so does a message
 * this tab is still sending, which the server does not hold yet.
 *
 * Caveat: a message older than the page that was deleted during the gap stays shown
 * until the channel is reopened.
 */
export function catchUpHistory(fetched: ChatMessage[], current: ChatMessage[]): ChatMessage[] {
  const oldest = fetched[0]?.createdAt;
  const fetchedIds = new Set(fetched.map((message) => message.id));
  const older = oldest === undefined ? [] : current.filter((message) =>
    !isPending(message) && !fetchedIds.has(message.id) && message.createdAt < oldest);
  return [...older, ...fetched, ...current.filter(isPending)];
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   wsTopics.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Topic naming shared with the bridge publisher (scripts/bridge-chat.mjs /
 * bridge-feed.mjs). The Rust realtime gateway treats topics as opaque exact-
 * match strings, so both sides must build them identically.
 */

export function chatTopic(workspaceId: string, channelId: string): string {
  return `chat:${workspaceId}:${channelId}`;
}

export function feedTopic(workspaceId: string): string {
  return `feed:${workspaceId}`;
}

export function presenceTopic(workspaceId: string): string {
  return `presence:${workspaceId}`;
}

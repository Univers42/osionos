/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sharedAnnounces.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 19:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 19:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Durable-announce feed (AOC §4): note/file events are NOTIFICATIONS that
 * something durable happened (a file was stored, a note was written) — they
 * carry only references, never payload bytes, and they are the only place the
 * ephemeral transport ever touches durable state, and only as a reference.
 * These reducers fold the announce stream into a capped feed + a current-files
 * projection. Pure and transport-free.
 */

import type { CollabEvent } from './realtimeTransport.port';

export type DurableAnnounce = Extract<CollabEvent, { t: 'note' } | { t: 'file' }>;

export const ANNOUNCE_CAP = 50;

/** Append a durable announce (self excluded); cursor/activity events pass through. */
export function appendAnnounce(
  feed: DurableAnnounce[], event: CollabEvent, selfId: string, cap = ANNOUNCE_CAP,
): DurableAnnounce[] {
  if (event.t !== 'note' && event.t !== 'file') return feed;
  if (event.actor === selfId) return feed;
  return [...feed, event].slice(-cap);
}

export interface SeededFile { fileId: string; name: string; by: string; }

/** Current set of seeded files from the announce feed ('removed' deletes). */
export function filesFromFeed(feed: DurableAnnounce[]): SeededFile[] {
  const byId = new Map<string, SeededFile>();
  for (const event of feed) {
    if (event.t !== 'file') continue;
    if (event.op === 'removed') byId.delete(event.fileId);
    else byId.set(event.fileId, { fileId: event.fileId, name: event.name, by: event.actor });
  }
  return [...byId.values()];
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   activitySignals.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pure mapping from awareness events to short, human-readable activity lines
 * (AOC §4) used for roster tooltips and the optional ambient ticker. Transport-
 * and DOM-free. Surfacing is throttled per-actor so a busy collaborator never
 * floods the UI — the "active-control pulse" is the primary, calm signal; these
 * lines are secondary text.
 */

import type { CollabEvent } from './realtimeTransport.port';

const ACTIVITY_PHRASES: Record<string, string> = {
  clicked: 'is interacting',
  'created-block': 'added a block',
  'deleted-block': 'removed a block',
  'opened-panel': 'opened a panel',
  navigated: 'is navigating',
  'seeded-file': 'shared a file',
  note: 'left a note',
};

/** A short label like "Amy added a block", or null for non-activity events. */
export function describeSignal(event: CollabEvent, displayName: string): string | null {
  if (event.t === 'nav') return `${displayName} moved to another page`;
  if (event.t === 'activity') {
    const phrase = ACTIVITY_PHRASES[event.kind];
    return phrase ? `${displayName} ${phrase}` : null;
  }
  return null;
}

/** Minimum gap between surfaced activity lines for one actor (calm, not spammy). */
export const ACTIVITY_THROTTLE_MS = 4_000;

/**
 * Decide whether to surface this actor's activity now, given the last time we
 * surfaced one. Pure: caller passes `now` and the per-actor last-surfaced map.
 */
export function shouldSurface(lastByActor: Map<string, number>, actor: string, now: number): boolean {
  const last = lastByActor.get(actor) ?? 0;
  return now - last >= ACTIVITY_THROTTLE_MS;
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collabPresence.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 16:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 16:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pure presence projection for the Shared-space roster (AOC §6). Transport-free:
 * takes the raw PRESENCE snapshot the gateway emits and collapses it into a
 * stable, self-excluded, non-jittery roster. Each member gets a deterministic,
 * WCAG-safe color (AOC R-A8) expressed as a `--collab-N` token reference — no
 * raw hex enters the codebase, so the style-token guard stays green and dark
 * mode is handled by the token definitions in global.css.
 */

import type { PresenceState } from './realtimeTransport.port';

/** Size of the curated --collab-1..N palette declared in global.css. */
export const COLLAB_PALETTE_SIZE = 8;

/** Deterministic per-member color token (AOC R-A8). Stable across reconnects. */
export function assignMemberColor(memberId: string): string {
  let hash = 0;
  for (let i = 0; i < memberId.length; i += 1) hash = (hash * 31 + memberId.charCodeAt(i)) >>> 0;
  return `var(--collab-${(hash % COLLAB_PALETTE_SIZE) + 1})`;
}

/** Two-letter avatar fallback when a member has no image. */
export function memberInitials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || '?';
}

/**
 * Collapse a presence snapshot into the roster: dedup by memberId (last wins),
 * drop self (the client never lists itself), and sort by display name so the
 * list stays calm as members come and go rather than reordering on every tick.
 */
export function rosterFromSnapshot(states: PresenceState[], selfId: string): PresenceState[] {
  const byId = new Map<string, PresenceState>();
  for (const state of states) {
    if (state.memberId && state.memberId !== selfId) byId.set(state.memberId, state);
  }
  return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** How many roster avatars to show before collapsing the rest into "+N". */
export const ROSTER_VISIBLE_LIMIT = 5;

/** Split a roster into the avatars shown inline and the hidden overflow count. */
export function splitRoster(
  members: PresenceState[],
  limit = ROSTER_VISIBLE_LIMIT,
): { shown: PresenceState[]; overflow: number } {
  if (members.length <= limit) return { shown: members, overflow: 0 };
  return { shown: members.slice(0, limit - 1), overflow: members.length - (limit - 1) };
}

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
 * mode is handled by the token definitions in app/styles/collab.css.
 */

import type { PresenceState } from './realtimeTransport.port';

/** Size of the curated --collab-1..N palette declared in app/styles/collab.css. */
export const COLLAB_PALETTE_SIZE = 8;

/** Deterministic per-member color token (AOC R-A8). Stable across reconnects. */
export function assignMemberColor(memberId: string): string {
  let hash = 0;
  for (let i = 0; i < memberId.length; i += 1) hash = (hash * 31 + memberId.charCodeAt(i)) >>> 0;
  return `var(--collab-${(hash % COLLAB_PALETTE_SIZE) + 1})`;
}

/**
 * The text colour to print ON a member colour (name flag, initials chip): the
 * matching --collab-ink-N token, which collab.css pairs to clear 4.5:1 in both
 * themes. Caveat: a colour that is not a --collab-N token (a hand-set value from
 * a future transport) gets the deep ink, which is only readable on the light
 * half of the spectrum; extend the palette instead of passing raw colours.
 */
export function inkFor(color: string): string {
  const match = /^var\(--collab-(\d+)\)$/.exec(color);
  const slot = match ? Number(match[1]) : 0;
  return slot >= 1 && slot <= COLLAB_PALETTE_SIZE ? `var(--collab-ink-${slot})` : 'var(--collab-ink-deep)';
}

// Module-level so the hot roster/presence path never rebuilds it.
const NAME_WORD_SEPARATORS = /[\s\-_.@]+/;

/** The first `count` code points of `text`, so an emoji or astral character is never split. */
function leadingCodePoints(text: string, count: number): string {
  let out = '';
  let taken = 0;
  for (const codePoint of text) {
    out += codePoint;
    taken += 1;
    if (taken === count) break;
  }
  return out;
}

/**
 * Avatar fallback when a member has no image: first and last word initials, so
 * "osi-member" and "osi-guest" read OM and OG instead of both reading OS. A
 * single word keeps its first two characters.
 * Caveat: names sharing first and last initials still collide ("Om Ali" and
 * "osi-member" are both OM); the colour ring is the second cue.
 */
export function memberInitials(name: string): string {
  const words = name.trim().split(NAME_WORD_SEPARATORS).filter(Boolean);
  if (words.length === 0) return '?';
  const initials = words.length === 1
    ? leadingCodePoints(words[0], 2)
    : leadingCodePoints(words[0], 1) + leadingCodePoints(words[words.length - 1], 1);
  return initials.toUpperCase();
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

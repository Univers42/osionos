/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   remoteCursors.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 17:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 17:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pure reducer for remote keyboard carets / selections (AOC §3, R-A1: caret &
 * selection only, never mouse). Folds the validated ephemeral CollabEvent stream
 * into a per-actor cursor map, guarded by the sender's monotone `seq` so an
 * out-of-order frame can never rewind a cursor. Transport-free and DOM-free, so
 * it is fully unit-testable; the overlay layer joins each cursor with the roster
 * (color/name) and resolves screen rects from the live DOM.
 *
 * Returns the SAME map reference when nothing changed (stale seq, self, or a
 * non-cursor event) so the store only re-renders subscribers on a real change.
 */

import type { CollabEvent, CaretState, SelectionRange } from './realtimeTransport.port';

export interface RemoteCursor {
  actor: string;
  seq: number;                       // highest applied ephemeral seq for this actor
  caret: CaretState | null;          // collapsed caret position (null when off-page/idle)
  selection: SelectionRange | null;  // active selection range, or null
  focusedElementId: string | null;   // a non-text control the actor is interacting with
  route: string | null;              // last navigated route (cross-page presence, §8)
}

export type CursorMap = Map<string, RemoteCursor>;

function blank(actor: string): RemoteCursor {
  return { actor, seq: -1, caret: null, selection: null, focusedElementId: null, route: null };
}

/**
 * Apply one validated CollabEvent to the cursor map. `selfId` is dropped (you
 * never render your own caret). Durable 'note'/'file' announces carry no seq and
 * are ignored here — they are handled by the durable feed, not the cursor layer.
 */
export function applyCollabEvent(cursors: CursorMap, event: CollabEvent, selfId: string): CursorMap {
  if (event.actor === selfId) return cursors;
  if (event.t === 'note' || event.t === 'file' || event.t === 'activity') return cursors;

  const prev = cursors.get(event.actor) ?? blank(event.actor);
  if (event.seq <= prev.seq) return cursors; // stale / out-of-order → ignore

  const next: RemoteCursor = { ...prev, seq: event.seq };
  switch (event.t) {
    case 'caret':
      next.caret = event.caret;
      next.selection = null;
      break;
    case 'selection':
      next.selection = event.range;
      next.caret = event.range ? event.range.focus : next.caret;
      break;
    case 'focus':
      next.focusedElementId = event.elementId;
      break;
    case 'nav':
      next.route = event.route;
      next.caret = null;      // navigated away → their caret on this page is gone (§8)
      next.selection = null;
      next.focusedElementId = null;
      break;
    default:
      return cursors;
  }
  const out = new Map(cursors);
  out.set(event.actor, next);
  return out;
}

/** Drop cursors for members no longer present (they left the space). */
export function pruneStale(cursors: CursorMap, presentMemberIds: Set<string>): CursorMap {
  let changed = false;
  const out = new Map(cursors);
  for (const actor of cursors.keys()) {
    if (!presentMemberIds.has(actor)) { out.delete(actor); changed = true; }
  }
  return changed ? out : cursors;
}

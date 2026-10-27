/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   presenceFrame.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * One measured snapshot of every remote collaborator's presence, as plain data:
 * carets and selections in view, gutter bars for the blocks they occupy, and the
 * people to point at from the top/bottom edge. The overlay renders a frame and
 * nothing else, so React never touches the DOM it is drawing over.
 *
 * All layout reads happen here, in one pass, before the overlay writes anything:
 * no read follows a write, so a frame costs one layout however many people are in.
 *
 * Caveat: positions are a snapshot, true the instant they were measured. A late
 * image load or font swap moves content without a DOM mutation, so marks catch up
 * at the next scroll, edit or remote move rather than the instant it shifts.
 */

import type { PresenceState } from './realtimeTransport.port';
import type { RemoteCursor } from './remoteCursors';
import { memberIdOf } from './collabActor';
import { inkFor, memberInitials } from './collabPresence';
import { controlRectFor, selectionRectsFor } from './caretDom';
import {
  activeBlockOrder, blockRectOf, boxOf, clipInset, placeCaret, renderedBlockIds, scrollerEl, viewportOf,
  type Box,
} from './presenceDom';
import {
  classifyRect, flagPlacement, groupByBlock, isCaretIdle, nextIdleDelay, visibleBoxes,
} from './presenceGeometry';

export interface Person {
  actor: string;
  memberId: string;
  name: string;
  color: string;
  ink: string;
  initials: string;
}

export interface CaretMark extends Person {
  caret: { left: number; top: number; height: number } | null; // set only while on screen; selection and control draw without it
  flag: 'above' | 'below';
  idle: boolean;
  selection: Box[];
  controlId: string | null;
  control: Box | null;
}

export interface GutterBar extends Box { blockId: string; people: Person[] }

export interface PresenceFrame {
  viewport: Box;
  /** `clip-path` that confines marks to the editor, so a caret scrolled under the
   *  top bar is cut off at the bar's edge instead of painting over it. */
  clip: string;
  carets: CaretMark[];
  bars: GutterBar[];
  above: Person[];
  below: Person[];
  /** Ms until the next expanded caret goes idle, so the owner can re-measure then. */
  idleIn: number | null;
}

function once<T>(compute: () => T): () => T {
  let done = false;
  let value: T;
  return () => {
    if (!done) { value = compute(); done = true; }
    return value;
  };
}

function personOf(actor: string, roster: ReadonlyMap<string, PresenceState>): Person | null {
  const member = roster.get(memberIdOf(actor));
  if (!member) return null;
  return {
    actor,
    memberId: member.memberId,
    name: member.displayName,
    color: member.color,
    ink: inkFor(member.color),
    initials: memberInitials(member.displayName),
  };
}

export function measurePresence(
  cursors: ReadonlyMap<string, RemoteCursor>,
  members: readonly PresenceState[],
  now: number,
): PresenceFrame {
  const roster = new Map(members.map((member) => [member.memberId, member]));
  const viewport = viewportOf(scrollerEl());
  const order = once(activeBlockOrder);
  const rendered = once(renderedBlockIds);

  const known: Array<{ cursor: RemoteCursor; person: Person }> = [];
  cursors.forEach((cursor) => {
    const person = personOf(cursor.actor, roster);
    if (person) known.push({ cursor, person });
  });
  known.sort((a, b) => a.person.actor.localeCompare(b.person.actor));

  const carets: CaretMark[] = [];
  const above: Person[] = [];
  const below: Person[] = [];
  for (const { cursor, person } of known) {
    const place = cursor.caret ? placeCaret(cursor.caret, viewport, order, rendered) : null;
    if (place && place.band !== 'visible') {
      (place.band === 'above' ? above : below).push(person);
    }
    const control = cursor.focusedElementId ? controlRectFor(cursor.focusedElementId) : null;
    const onScreen = place?.band === 'visible' ? place.rect : null;
    // Independent of the caret: the focus end may be scrolled out while the rest
    // of the highlight is still in view. Both ends unmounted measures as [].
    const selection = cursor.selection ? visibleBoxes(selectionRectsFor(cursor.selection).map(boxOf), viewport) : [];
    if (!onScreen && !control && selection.length === 0) continue;
    carets.push({
      ...person,
      caret: onScreen,
      flag: onScreen ? flagPlacement(onScreen, viewport.top) : 'above',
      idle: isCaretIdle(cursor.movedAt, now),
      selection,
      controlId: cursor.focusedElementId,
      control: control ? boxOf(control) : null,
    });
  }

  const byActor = new Map(known.map(({ person }) => [person.actor, person]));
  const bars: GutterBar[] = [];
  groupByBlock(known.map((entry) => entry.cursor), order()).forEach((actors, blockId) => {
    const rect = blockRectOf(blockId);
    if (!rect || classifyRect(rect, viewport) !== 'visible') return;
    const people = actors.flatMap((actor) => byActor.get(actor) ?? []);
    if (people.length > 0) bars.push({ ...boxOf(rect), blockId, people });
  });

  const live = known.filter(({ cursor }) => cursor.caret).map(({ cursor }) => cursor.movedAt);
  return { viewport: boxOf(viewport), clip: clipInset(viewport), carets, bars, above, below, idleIn: nextIdleDelay(live, now) };
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-presence-ink.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Colour-independent identity pieces of the presence overlay: inkFor maps a
 * member colour to the text colour that stays legible on it, and the reducer
 * stamps movedAt so a caret's name flag can collapse once it rests.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { COLLAB_PALETTE_SIZE, inkFor } from '@/features/collab/model/collabPresence';
import { applyCollabEvent, type CursorMap } from '@/features/collab/model/remoteCursors';
import type { CollabEvent } from '@/features/collab/model/realtimeTransport.port';

test('inkFor pairs each palette slot with its own ink token', () => {
  for (let slot = 1; slot <= COLLAB_PALETTE_SIZE; slot += 1) {
    assert.equal(inkFor(`var(--collab-${slot})`), `var(--collab-ink-${slot})`);
  }
});

test('inkFor falls back to deep ink for anything outside the palette', () => {
  for (const color of ['#ffffff', 'red', '', 'var(--collab-0)', 'var(--collab-9)', 'var(--collab-1) ', 'var(--accent)']) {
    assert.equal(inkFor(color), 'var(--collab-ink-deep)', JSON.stringify(color));
  }
});

const caret = (seq: number): CollabEvent => ({ t: 'caret', actor: 'bob:t1', seq, caret: { blockId: 'b1', offset: seq } });
const range = { anchor: { blockId: 'b1', offset: 0 }, focus: { blockId: 'b2', offset: 4 } };

test('movedAt is stamped by caret, selection and nav frames, with the injected clock', () => {
  let cursors: CursorMap = new Map();
  cursors = applyCollabEvent(cursors, caret(1), 'me', 1000);
  assert.equal(cursors.get('bob:t1')?.movedAt, 1000);
  cursors = applyCollabEvent(cursors, { t: 'selection', actor: 'bob:t1', seq: 2, range }, 'me', 2000);
  assert.equal(cursors.get('bob:t1')?.movedAt, 2000);
  cursors = applyCollabEvent(cursors, { t: 'nav', actor: 'bob:t1', seq: 3, route: '/x' }, 'me', 3000);
  assert.equal(cursors.get('bob:t1')?.movedAt, 3000);
});

test('a focus frame or a stale frame does not wake an idle caret', () => {
  let cursors: CursorMap = applyCollabEvent(new Map(), caret(5), 'me', 1000);
  cursors = applyCollabEvent(cursors, { t: 'focus', actor: 'bob:t1', seq: 6, elementId: 'btn' }, 'me', 9000);
  assert.equal(cursors.get('bob:t1')?.movedAt, 1000, 'moving focus between controls is not typing');
  const stale = applyCollabEvent(cursors, caret(2), 'me', 9500);
  assert.equal(stale, cursors, 'stale seq returns the same map');
  assert.equal(stale.get('bob:t1')?.movedAt, 1000);
});

test('a cursor that never moved starts with movedAt 0 (idle)', () => {
  const cursors = applyCollabEvent(new Map(), { t: 'focus', actor: 'bob:t1', seq: 1, elementId: 'btn' }, 'me', 5000);
  assert.equal(cursors.get('bob:t1')?.movedAt, 0);
});

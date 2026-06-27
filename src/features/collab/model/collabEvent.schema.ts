/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collabEvent.schema.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Boundary validators (AOC R-P1): every inbound realtime frame is validated
 * here before it reaches a reducer or the render path. Malformed events are
 * DROPPED (return null), never thrown into render. Hand-rolled — no schema
 * dependency added (ponytail: the union is small and closed).
 *
 * An unknown discriminant — including any 'mouse'/'pointer' — falls through to
 * null, so a stray mouse event can never enter the system (AOC R-A1).
 */

import type { CaretState, CollabEvent, SummonReq } from './realtimeTransport.port';

const ACTIVITY_KINDS = new Set([
  'clicked', 'created-block', 'deleted-block', 'opened-panel', 'navigated', 'seeded-file', 'note',
]);
const NOTE_OPS = new Set(['created', 'resolved', 'deleted']);
const FILE_OPS = new Set(['seeded', 'removed']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCaret(value: unknown): value is CaretState {
  return isRecord(value) && typeof value.blockId === 'string' && typeof value.offset === 'number';
}

/** Validate one inbound message into a CollabEvent, or null to drop it. */
export function validateCollabEvent(value: unknown): CollabEvent | null {
  if (!isRecord(value) || typeof value.t !== 'string') return null;
  const seqOk = typeof value.actor === 'string' && typeof value.seq === 'number';
  switch (value.t) {
    case 'caret':
      return seqOk && isCaret(value.caret) ? (value as CollabEvent) : null;
    case 'selection':
      if (!seqOk) return null;
      if (value.range === null) return value as CollabEvent;
      return isRecord(value.range) && isCaret(value.range.anchor) && isCaret(value.range.focus)
        ? (value as CollabEvent) : null;
    case 'focus':
      return seqOk && (value.elementId === null || typeof value.elementId === 'string')
        ? (value as CollabEvent) : null;
    case 'activity':
      return seqOk && typeof value.kind === 'string' && ACTIVITY_KINDS.has(value.kind)
        && typeof value.targetId === 'string' ? (value as CollabEvent) : null;
    case 'nav':
      return seqOk && typeof value.route === 'string' ? (value as CollabEvent) : null;
    case 'note':
      return typeof value.actor === 'string' && typeof value.noteId === 'string'
        && typeof value.op === 'string' && NOTE_OPS.has(value.op) && isRecord(value.anchor)
        && typeof value.anchor.blockId === 'string' ? (value as CollabEvent) : null;
    case 'file':
      return typeof value.actor === 'string' && typeof value.fileId === 'string'
        && typeof value.op === 'string' && FILE_OPS.has(value.op) && typeof value.name === 'string'
        ? (value as CollabEvent) : null;
    default:
      return null; // unknown discriminant (incl. 'mouse'/'pointer') → dropped (R-A1)
  }
}

/** Validate a directed summon request at the boundary (R-P1). */
export function validateSummonReq(value: unknown): SummonReq | null {
  if (!isRecord(value) || value.kind !== 'summon' || typeof value.route !== 'string') return null;
  if (value.message !== undefined && typeof value.message !== 'string') return null;
  if (value.anchor !== undefined && !(isRecord(value.anchor) && typeof value.anchor.blockId === 'string')) return null;
  return value as unknown as SummonReq;
}

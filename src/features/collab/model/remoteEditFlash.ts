/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   remoteEditFlash.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Which blocks a collaborator just changed, as a short-lived, bounded list. Pure
 * (list in, list out): the store that holds it (remoteEditStore.ts) and the overlay
 * that fades a tint over each block (ui/CollabEditFlash.tsx) stay thin.
 *
 * A flash lives FLASH_TTL_MS. The overlay fades it over FLASH_FADE_MS and keeps
 * the last 200 ms invisible, so a re-render that lands late never shows a ghost.
 * A second edit of the same block replaces the first, which restarts the fade.
 *
 * Caveat: "applied" is read off the register table, which credits the winning
 * (v, actor) pair. A re-delivered duplicate of an op this replica already holds
 * therefore flashes again when it rides in a batch with a genuinely new op: noise,
 * never a missed edit.
 */

import { registerKeyOf, type BlockRegisterTable } from './blockSync';
import type { BlockOp } from './realtimeTransport.port';

export interface EditFlash {
  blockId: string;
  actor: string;
  at: number;
}

export const FLASH_TTL_MS = 900;
export const FLASH_FADE_MS = 700;
/** More simultaneous flashes than this is a paste or an import, not an edit anyone can follow. */
export const FLASH_MAX = 24;

/** The list with `entry` added: expired entries and any earlier flash of the same
 *  block are dropped, and only the newest FLASH_MAX are kept. Never mutates `list`. */
export function recordFlash(list: readonly EditFlash[], entry: EditFlash): EditFlash[] {
  const kept = list.filter((flash) => flash.blockId !== entry.blockId && flash.at + FLASH_TTL_MS > entry.at);
  kept.push(entry);
  return kept.length > FLASH_MAX ? kept.slice(kept.length - FLASH_MAX) : kept;
}

/** The flashes still showing at `now`; the SAME array when none has expired. */
export function liveFlashes(list: readonly EditFlash[], now: number): readonly EditFlash[] {
  const live = list.filter((flash) => flash.at + FLASH_TTL_MS > now);
  return live.length === list.length ? list : live;
}

/** Ms until the first live flash expires, or null when none is showing. */
export function nextFlashExpiry(list: readonly EditFlash[], now: number): number | null {
  let soonest: number | null = null;
  for (const flash of list) {
    const left = flash.at + FLASH_TTL_MS - now;
    if (left > 0 && (soonest === null || left < soonest)) soonest = left;
  }
  return soonest;
}

/** The ops of `ops` that `registers` (the table AFTER applyBlockOps) credits to `actor`,
 *  i.e. the ones that actually won last-writer-wins instead of being outranked. */
export function appliedOps(ops: readonly BlockOp[], actor: string, registers: BlockRegisterTable): BlockOp[] {
  return ops.filter((op) => {
    const held = registers[registerKeyOf(op)];
    return held !== undefined && held.v === op.v && held.actor === actor;
  });
}

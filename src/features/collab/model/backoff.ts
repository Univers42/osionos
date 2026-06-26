/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   backoff.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 19:45:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 19:45:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Exponential-backoff schedule for the realtime adapter's reconnect loop
 * (AOC §8 resilience). Pure and deterministic so it is unit-testable; the
 * adapter owns the timers. A dropped socket re-auths + re-subscribes + re-tracks
 * presence after `backoffDelay(attempt)`, capped, giving up after MAX attempts so
 * an unreachable gateway (or a dead token) can't loop forever.
 */

export interface BackoffOpts { baseMs?: number; capMs?: number; factor?: number; }

export const MAX_RECONNECT_ATTEMPTS = 6;

/** Delay before reconnect attempt N (1-based): base·factor^(N-1), capped. */
export function backoffDelay(attempt: number, opts: BackoffOpts = {}): number {
  const { baseMs = 500, capMs = 15_000, factor = 2 } = opts;
  if (attempt <= 0) return 0;
  const raw = baseMs * factor ** (attempt - 1);
  return Math.min(raw, capMs);
}

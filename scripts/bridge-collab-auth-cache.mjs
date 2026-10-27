/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-collab-auth-cache.mjs                        :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The cross-request access cache of the collab events route (coedit-latency verdict
 * C5-C7). It remembers that one authorization check ALLOWED, so the next event of the same
 * user on the same page skips the membership, page-row, share-rule and team reads
 * (5 PostgREST calls per event, measured live 2026-10-27: access p50 171 ms, membership
 * p50 83.5 ms).
 *
 * What it holds: a verdict, never an input. `check` is the whole authorization composite
 * of one event (membership, page level and, for a write, the write gate), so the page-owner
 * check (C557) and the rule floor (C558) are never held apart from the write decision.
 * Session verification (C2) runs before this and is never cached.
 *
 * Key: user + workspace + page + class (read | write | note). The class is part of the key
 * because a read allow says nothing about a write. There is no block set in the key:
 * authorizeBlocks decides per page and reads no op, so two block edits of one page get the
 * same verdict.
 *
 * Rules, each load-bearing:
 * - Allow-only. A check that throws (a denial, a 5xx, a truncated rule read) propagates and
 *   stores nothing, so a revalidate error fails closed and a denial is re-asked every time.
 * - Off unless COLLAB_AUTH_CACHE=1. COLLAB_AUTH_CACHE_TTL_MS is clamped to [0, 5000] ms
 *   (default 2000); 0, or a value that is not a number, turns the cache off.
 * - An entry dies on its TTL or when a generation it was read under moves
 *   (bridge-access-generation.mjs). The ticket is taken before the reads and re-checked
 *   before the store, so a write that lands while the check runs prevents the store.
 *
 * Replicas: 1 live bridge (`track-binocle-osionos-bridge-1`, docker ps, 2026-10-27). With a
 * second replica, or for a writer outside this process (a database job, a hand-run SQL),
 * the TTL is the only bound: up to COLLAB_AUTH_CACHE_TTL_MS of stale allow.
 *
 * Caveat: a revoked or downgraded user can still publish for up to the TTL (at most 5 s)
 * plus the duration of the one access check that stored the allow, after an
 * out-of-process write: expiry counts from when the verdict landed, not from when its
 * reads began, because anchoring it earlier would break the expiry-ordered eviction
 * below. For an in-process write the window is the gap between the
 * rows landing and the writer's bump (one await): an event that hits an older entry in
 * that gap is still allowed. The map is capped at MAX_ENTRIES; at the cap the oldest
 * entries go, which only costs a re-check.
 */

import { performance } from 'node:perf_hooks';
import { accessTicket, ticketIsCurrent } from './bridge-access-generation.mjs';
import { markAuthCache } from './bridge-server-timing.mjs';

export const TTL_CAP_MS = 5000;
export const DEFAULT_TTL_MS = 2000;
const MAX_ENTRIES = 5000;

/** The effective TTL in ms; 0 means off. */
export function authCacheTtlMs(env) {
	if (env?.COLLAB_AUTH_CACHE !== '1') return 0;
	const raw = env.COLLAB_AUTH_CACHE_TTL_MS;
	if (raw === undefined || raw === '') return DEFAULT_TTL_MS;
	const ttl = Number(raw);
	return Number.isFinite(ttl) ? Math.min(Math.max(Math.trunc(ttl), 0), TTL_CAP_MS) : 0;
}

export function createCollabAuthCache({ env = process.env, now = () => performance.now() } = {}) {
	const ttlMs = authCacheTtlMs(env);
	const entries = new Map();

	// Insertion order is expiry order (every entry lives the same TTL), so the expired
	// entries are a prefix of the map.
	function remember(key, ticket) {
		const current = now();
		entries.delete(key);
		for (const [oldKey, entry] of entries) {
			if (entry.expiresAt > current && entries.size < MAX_ENTRIES) break;
			entries.delete(oldKey);
		}
		entries.set(key, { expiresAt: current + ttlMs, ticket });
	}

	return {
		ttlMs,
		/**
		 * Run `check` unless a live allow for `scope` is cached. `check` throws to deny; its
		 * throw is never swallowed. `scope.kind` null marks an event whose verdict is not
		 * cacheable (it always runs `check`).
		 */
		async authorize({ userId, workspaceId, pageId, kind }, check) {
			if (ttlMs === 0) {
				markAuthCache('off');
				return check();
			}
			const key = [userId, workspaceId, pageId, kind].join('|').toLowerCase();
			const hit = entries.get(key);
			if (hit && hit.expiresAt > now() && ticketIsCurrent(hit.ticket)) {
				markAuthCache('hit');
				return undefined;
			}
			entries.delete(key);
			markAuthCache('miss');
			if (kind === null) return check();
			const ticket = accessTicket(userId, workspaceId);
			await check();
			if (ticketIsCurrent(ticket)) remember(key, ticket);
			return undefined;
		},
	};
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-presence.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The one definition of presence: a heartbeat writes the server's clock into the shared
 * key/value store, and every projection reads it back from there.
 *
 * The old model wrote `osionos_bridge_identities.last_seen_at` on every beat (one write per
 * open client every 45 s: ~222 writes/s at 10K online users) and derived "online" from that
 * column in three places, with the 90 s window spelled out three times. Here the beat is a
 * key/value write, the database write happens at most once per user per ten minutes, and the
 * window lives in this file only.
 *
 * Caveat: `last_seen_at` in the database is now up to ten minutes stale, so a surface that
 * projects it (the profile card) shows a coarse value while `online` is exact.
 * Caveat: the presence keys live in the shared store, so without a Redis the bridge is one
 * replica only and a user is online on the replica that saw the beat.
 */

import { rateLimit } from './bridge-guard.mjs';
import { rest } from './bridge-social-core.mjs';

/** How long a beat keeps a user online. The only copy of this number in the bridge. */
export const PRESENCE_TTL_MS = 90_000;
// Caveat: the column is written at most once per window, so a user who closes and reopens
// the app right after a write keeps a stale `last_seen_at` for the rest of the window.
export const PRESENCE_PG_TTL_MS = 600_000;
/**
 * The keys one presence read may carry: one MGET per 100 users. A key/value read carries no
 * query string, so this bound is the reply size, not Kong's 4 KB header buffer.
 */
export const PRESENCE_BATCH = 100;
// Caveat: the limit counts beats, not tabs: a user with a dozen tabs open spends it alone.
const HEARTBEAT_LIMIT = 10;
const HEARTBEAT_WINDOW_MS = 60_000;

export function presenceKey(userId) {
	return `presence:${userId}`;
}

export function presencePgKey(userId) {
	return `presence-pg:${userId}`;
}

// One warning per state change: a store that is down must not flood the log, and the
// recovery must be said once too. The state is per caller: the heartbeat and the read can
// fail independently.
const storeDown = new Map();

function noteStoreDown(kind, message) {
	if (storeDown.get(kind)) return;
	storeDown.set(kind, true);
	console.warn(`[osionos-bridge] ${message}`);
}

function noteStoreUp(kind) {
	if (!storeDown.get(kind)) return;
	storeDown.delete(kind);
	console.warn('[osionos-bridge] the shared key/value store answers again.');
}

/**
 * The users of `userIds` the store says are online. One MGET per 100 keys; a store that
 * fails answers an empty set (presence never fails a request) and the next read retries.
 */
export async function onlineAmong(kv, userIds, { now = Date.now() } = {}) {
	const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((id) => String(id ?? '')).filter(Boolean))];
	if (!kv || typeof kv.getMany !== 'function' || ids.length === 0) return new Set();
	const online = new Set();
	try {
		for (let at = 0; at < ids.length; at += PRESENCE_BATCH) {
			const chunk = ids.slice(at, at + PRESENCE_BATCH);
			const values = await kv.getMany(chunk.map(presenceKey));
			chunk.forEach((id, index) => {
				const seen = Number(values?.[index]);
				if (Number.isFinite(seen) && now - seen < PRESENCE_TTL_MS) online.add(id);
			});
		}
		noteStoreUp('read');
	} catch (error) {
		noteStoreDown('read', `presence read skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
		return new Set();
	}
	return online;
}

/**
 * One heartbeat: the presence key, then the database write when the ten-minute window
 * allows it. The body of the request is never read — the clock is the server's.
 *
 * A store that fails answers "not written" and no database write; the next beat retries.
 * The rate limit is the one failure that reaches the caller: eleven beats inside a minute
 * are a 429, not a silent drop.
 */
export async function recordHeartbeat(kv, { userId, config, fetchImpl, now = Date.now() } = {}) {
	if (!kv) return { written: false };
	try {
		await rateLimit(kv, ['heartbeat', userId], { limit: HEARTBEAT_LIMIT, windowMs: HEARTBEAT_WINDOW_MS });
	} catch (error) {
		if (error?.code === 'rate_limited') throw error;
		noteStoreDown('beat', `heartbeat skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
		return { written: false };
	}
	try {
		await kv.set(presenceKey(userId), String(now), PRESENCE_TTL_MS);
		const fresh = await kv.setNx(presencePgKey(userId), '1', PRESENCE_PG_TTL_MS);
		if (!fresh) {
			noteStoreUp('beat');
			return { written: false };
		}
	} catch (error) {
		noteStoreDown('beat', `heartbeat skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
		return { written: false };
	}
	try {
		await rest(config, fetchImpl, `osionos_bridge_identities?user_id=eq.${userId}`, {
			method: 'PATCH',
			body: { last_seen_at: new Date(now).toISOString() },
			prefer: 'return=minimal',
		});
	} catch (error) {
		// The window key is released so the next beat writes the column instead of
		// leaving it stale for the whole window.
		await kv.del(presencePgKey(userId)).catch(() => undefined);
		console.warn(`[osionos-bridge] presence write skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
		return { written: false };
	}
	noteStoreUp('beat');
	return { written: true };
}

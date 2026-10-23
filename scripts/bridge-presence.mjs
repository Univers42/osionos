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
import { httpError, rest } from './bridge-social-core.mjs';

/** `away` is set by hand only: nothing here infers idleness. */
export const PRESENCE_STATES = Object.freeze(['online', 'away', 'dnd', 'invisible']);
const CUSTOM_TEXT_LIMIT = 120;

/** How long a beat keeps a user online. The only copy of this number in the bridge. */
export const PRESENCE_TTL_MS = 90_000;
// Caveat: the column is written at most once per window, so a user who closes and reopens
// the app right after a write keeps a stale `last_seen_at` for the rest of the window, and
// `osionos_presence.state` is as stale: the key/value store is the live answer, not the table.
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

/**
 * The key a beat writes since states exist: `{ts, state, customText}`. A new name, so a
 * replica still on the old code never parses it as a timestamp during a rolling deploy.
 */
export function presenceV2Key(userId) {
	return `presence:v2:${userId}`;
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

function parseEntry(raw, legacy, now) {
	if (typeof raw === 'string' && raw !== '') {
		try {
			const value = JSON.parse(raw);
			if (value && typeof value === 'object' && Number.isFinite(value.ts) && PRESENCE_STATES.includes(value.state)) {
				return now - value.ts < PRESENCE_TTL_MS ? { state: value.state, customText: typeof value.customText === 'string' ? value.customText : null } : null;
			}
		} catch {
			// Not JSON: a replica that predates v2 may have written a bare timestamp here.
		}
	}
	// Caveat: for one release the old key counts as `online` with no text, so a user whose
	// client has not updated yet cannot show away or dnd.
	const seen = Number(legacy);
	return Number.isFinite(seen) && now - seen < PRESENCE_TTL_MS ? { state: 'online', customText: null } : null;
}

/**
 * The users of `userIds` the store says are online, as `Map(id -> {state, customText})`.
 * An invisible user is absent for every viewer but themselves (`viewerId`), so a caller that
 * names no viewer never sees one. One MGET per 100 users carries both key generations; a
 * store that fails answers an empty map (presence never fails a request) and the next read
 * retries.
 */
export async function onlineAmong(kv, userIds, { now = Date.now(), viewerId = null } = {}) {
	const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((id) => String(id ?? '')).filter(Boolean))];
	if (!kv || typeof kv.getMany !== 'function' || ids.length === 0) return new Map();
	const online = new Map();
	try {
		for (let at = 0; at < ids.length; at += PRESENCE_BATCH) {
			const chunk = ids.slice(at, at + PRESENCE_BATCH);
			const values = await kv.getMany([...chunk.map(presenceV2Key), ...chunk.map(presenceKey)]);
			chunk.forEach((id, index) => {
				const entry = parseEntry(values?.[index], values?.[chunk.length + index], now);
				if (entry && (entry.state !== 'invisible' || id === viewerId)) online.set(id, entry);
			});
		}
		noteStoreUp('read');
	} catch (error) {
		noteStoreDown('read', `presence read skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
		return new Map();
	}
	return online;
}

/**
 * The state a beat asks for. `undefined` keeps what the key holds, `null` on the text
 * clears it; anything else outside the contract is a 422 before a single write.
 */
export function parseBeat(payload) {
	if (payload === undefined || payload === null) return {};
	if (typeof payload !== 'object' || Array.isArray(payload)) throw Object.assign(httpError('The heartbeat body must be a JSON object.', 422), { code: 'invalid_body' });
	const beat = {};
	if (payload.state !== undefined) {
		if (!PRESENCE_STATES.includes(payload.state)) throw Object.assign(httpError(`state must be one of ${PRESENCE_STATES.join(', ')}.`, 422), { code: 'invalid_state' });
		beat.state = payload.state;
	}
	if (payload.customText !== undefined) {
		const text = payload.customText;
		if (text !== null && (typeof text !== 'string' || Array.from(text).length > CUSTOM_TEXT_LIMIT)) {
			throw Object.assign(httpError(`customText must be text of at most ${CUSTOM_TEXT_LIMIT} characters, or null.`, 422), { code: 'invalid_custom_text' });
		}
		beat.customText = text === '' ? null : text;
	}
	return beat;
}

async function previousBeat(kv, userId, now) {
	return parseEntry(await kv.get(presenceV2Key(userId)), null, now) ?? { state: 'online', customText: null };
}

/**
 * One heartbeat: the presence key, then the database write when the ten-minute window
 * allows it. The clock is the server's; `state` and `customText` come from the caller
 * after `parseBeat`, and a beat that names neither keeps what the previous beat set.
 * Caveat: that memory is the key's 90 s life, so a client that stops beating and returns
 * later starts again from `online`; the client sends its chosen state on every beat.
 *
 * A store that fails answers "not written" and no database write; the next beat retries.
 * The rate limit is the one failure that reaches the caller: eleven beats inside a minute
 * are a 429, not a silent drop.
 */
export async function recordHeartbeat(kv, { userId, config, fetchImpl, now = Date.now(), state, customText } = {}) {
	if (!kv) return { written: false };
	try {
		await rateLimit(kv, ['heartbeat', userId], { limit: HEARTBEAT_LIMIT, windowMs: HEARTBEAT_WINDOW_MS });
	} catch (error) {
		if (error?.code === 'rate_limited') throw error;
		noteStoreDown('beat', `heartbeat skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
		return { written: false };
	}
	let entry;
	try {
		const before = await previousBeat(kv, userId, now);
		entry = {
			state: state ?? before.state,
			customText: customText === undefined ? before.customText : customText,
		};
		await kv.set(presenceV2Key(userId), JSON.stringify({ ts: now, ...entry }), PRESENCE_TTL_MS);
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
		const seenAt = new Date(now).toISOString();
		await Promise.all([
			rest(config, fetchImpl, `osionos_bridge_identities?user_id=eq.${userId}`, {
				method: 'PATCH',
				body: { last_seen_at: seenAt },
				prefer: 'return=minimal',
			}),
			rest(config, fetchImpl, 'osionos_presence?on_conflict=user_id', {
				method: 'POST',
				body: { user_id: userId, state: entry.state, custom_text: entry.customText, updated_at: seenAt },
				prefer: 'resolution=merge-duplicates,return=minimal',
			}),
		]);
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

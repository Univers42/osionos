/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-activity-consent.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Synchronous consent gate for the activity emitter: answers from a per-user cache of the
 * `activity_tracking` key of the user's `preferences` section and fills it asynchronously.
 * It does not read `beacon_consent`, whose purpose is the recommender's (bridge-events.mjs).
 *
 * `awaitTracked` is the emitter's door: a hit answers synchronously, a miss answers with the
 * fill's promise so the event waits for it instead of being lost.
 *
 * Caveat: a coarse gate, not a per-event proof. Sync `isTracked` still answers false on a miss.
 * At most 20 fills run at once; a miss with no free slot is refused (counted in stats().droppedFillCap)
 * with no query, so a flood of distinct users loses their first event rather than loading the store.
 * An opt-out takes effect after at most the TTL (60 s). A failed fill is cached as false for a TTL,
 * so a store outage fails closed and does not hammer the store.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 10_000;
const MAX_FILLS = 20;

export function createActivityConsent({ pg, ttlMs = DEFAULT_TTL_MS, maxEntries = MAX_ENTRIES, now = Date.now }) {
	const cache = new Map();
	const filling = new Map();
	let droppedFillCap = 0;

	function remember(userId, value) {
		cache.delete(userId);
		cache.set(userId, { value, at: now() });
		if (cache.size > maxEntries) cache.delete(cache.keys().next().value);
		return value;
	}

	// Returns the in-flight promise, or null when no slot is free.
	function fill(userId) {
		const running = filling.get(userId);
		if (running) return running;
		if (filling.size >= MAX_FILLS) return null;
		const started = pg
			.asService()
			.get(`osionos_user_settings?user_id=eq.${userId}&section=eq.preferences&select=value&limit=1`)
			.then((rows) => remember(userId, Array.isArray(rows) && rows[0]?.value?.activity_tracking === true))
			.catch(() => remember(userId, false))
			.finally(() => filling.delete(userId));
		filling.set(userId, started);
		return started;
	}

	function lookup(session) {
		const userId = session?.userId;
		if (typeof userId !== 'string' || !UUID.test(userId)) return false;
		const entry = cache.get(userId);
		const age = entry ? now() - entry.at : Infinity;
		if (age < ttlMs) {
			// Refresh a hot entry halfway through its life so an active user is not a miss every TTL.
			if (age >= ttlMs / 2) void fill(userId);
			return entry.value;
		}
		const started = fill(userId);
		if (started) return started;
		droppedFillCap += 1;
		return false;
	}

	const isTracked = (session) => lookup(session) === true;

	return { isTracked, awaitTracked: lookup, stats: () => ({ droppedFillCap, filling: filling.size }), size: () => cache.size };
}

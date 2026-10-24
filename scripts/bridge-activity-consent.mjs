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
 * Caveat: a coarse gate, not a per-event proof. A miss answers false, so the first event of a
 * newly opted-in user is lost; an opt-out takes effect after at most the TTL (60 s). A failed
 * fill is cached as false for a TTL, so a store outage fails closed and does not hammer the store.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 10_000;

export function createActivityConsent({ pg, ttlMs = DEFAULT_TTL_MS, maxEntries = MAX_ENTRIES, now = Date.now }) {
	const cache = new Map();
	const filling = new Set();

	function remember(userId, value) {
		cache.delete(userId);
		cache.set(userId, { value, at: now() });
		if (cache.size > maxEntries) cache.delete(cache.keys().next().value);
	}

	async function fill(userId) {
		if (filling.has(userId)) return;
		filling.add(userId);
		try {
			const rows = await pg.asService().get(`osionos_user_settings?user_id=eq.${userId}&section=eq.preferences&select=value&limit=1`);
			remember(userId, Array.isArray(rows) && rows[0]?.value?.activity_tracking === true);
		} catch {
			remember(userId, false);
		} finally {
			filling.delete(userId);
		}
	}

	function isTracked(session) {
		const userId = session?.userId;
		if (typeof userId !== 'string' || !UUID.test(userId)) return false;
		const entry = cache.get(userId);
		const age = entry ? now() - entry.at : Infinity;
		// Refresh a hot entry halfway through its life so an active user is not a miss every TTL.
		if (age >= ttlMs / 2) void fill(userId);
		return age < ttlMs && entry.value;
	}

	return { isTracked, size: () => cache.size };
}

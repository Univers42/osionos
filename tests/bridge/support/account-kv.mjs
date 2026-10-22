/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   account-kv.mjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The shared key/value store as the account plane uses it, with the TTLs HONOURED.
 *
 * The plain stub (kv-stub.mjs) keeps every value forever, which cannot show that a sudo
 * grant ends: the grant is a ten-minute key, and the test has to be able to move the
 * clock past it. This store expires on the clock the test injects, so the bridge and the
 * test read the same clock — the same trick the real store plays with its own.
 *
 * The keys carry the 'osb:' prefix the real store adds, so the assertions read like the
 * wire.
 */

const PREFIX = 'osb:';

export function createTtlKv({ now = () => Date.now() } = {}) {
	const values = new Map();

	function live(key) {
		const name = PREFIX + key;
		const entry = values.get(name);
		if (!entry) return null;
		if (entry.expiresAt <= now()) {
			values.delete(name);
			return null;
		}
		return entry;
	}

	function put(key, value, ttlMs) {
		values.set(PREFIX + key, { value: String(value), expiresAt: now() + ttlMs });
	}

	return {
		values,
		keys: () => [...values.keys()],
		has: (key) => live(key) !== null,
		backend: () => 'memory',
		async get(key) {
			return live(key)?.value ?? null;
		},
		async set(key, value, ttlMs) {
			put(key, value, ttlMs);
		},
		async setNx(key, value, ttlMs) {
			if (live(key)) return false;
			put(key, value, ttlMs);
			return true;
		},
		async getDel(key) {
			const entry = live(key);
			if (!entry) return null;
			values.delete(PREFIX + key);
			return entry.value;
		},
		async incrWithTtl(key, ttlMs) {
			const entry = live(key);
			const next = Number(entry?.value ?? 0) + 1;
			values.set(PREFIX + key, { value: String(next), expiresAt: entry?.expiresAt ?? now() + ttlMs });
			return next;
		},
		close() {},
	};
}

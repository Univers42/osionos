/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   kv-stub.mjs                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The key/value facade as the bridge modules use it, with the keys it holds left visible:
 * a test has to be able to say "the store holds no handoff key" and name the key space.
 * The 'osb:' prefix is the one the real store adds, so the assertions read like the wire.
 */

const PREFIX = 'osb:';

export function kvStub() {
	const values = new Map();
	const full = (key) => PREFIX + key;
	return {
		values,
		keys: () => [...values.keys()],
		has: (key) => values.has(full(key)),
		backend: () => 'memory',
		async get(key) {
			return values.get(full(key)) ?? null;
		},
		async getMany(keys) {
			return keys.map((key) => values.get(full(key)) ?? null);
		},
		async set(key, value) {
			values.set(full(key), String(value));
		},
		async setNx(key, value) {
			if (values.has(full(key))) return false;
			values.set(full(key), String(value));
			return true;
		},
		async getDel(key) {
			const name = full(key);
			const value = values.get(name) ?? null;
			values.delete(name);
			return value;
		},
		async incrWithTtl(key) {
			const name = full(key);
			const next = Number(values.get(name) ?? 0) + 1;
			values.set(name, String(next));
			return next;
		},
		close() {},
	};
}

/** The handoff keys the store holds, with the 'osb:handoff:' prefix the wire uses. */
export function handoffKeys(kv) {
	return kv.keys().filter((key) => key.startsWith(`${PREFIX}handoff:`));
}

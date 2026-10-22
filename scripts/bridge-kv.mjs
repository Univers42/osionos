/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-kv.mjs                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Shared, TTL-bounded key/value state, ported from the auth gateway's
 * `apps/opposite-osiris/scripts/auth/store.mjs` (the bridge image cannot import across
 * apps). One interface over a bounded memory store and a zero-dependency RESP client.
 * `SET … PX … NX`, `GETDEL` (Redis 6.2) and `PEXPIRE … NX` (7.0) are required; production
 * is an unpinned `apk add redis` (grobase infra/docker/services/redis/Dockerfile:9,11),
 * so P0-4 verifies the version. P0-4 sets `required: true` on a multi-replica deploy,
 * where a memory fallback would let two replicas consume the same handoff token.
 * Caveat: non-required mode falls back to memory on a Redis failure, so a set/getDel pair
 * split across the switch can lose the key or consume it twice.
 */

import { RedisKv } from './bridge-redis.mjs';

const PREFIX = 'osb:';
const DEFAULT_MAX_ENTRIES = 50_000;
const DEFAULT_SWEEP_MS = 60_000;
const READY_TIMEOUT_MS = 5_000;
const KV_MESSAGE = 'The shared key/value store is unavailable.';
const kvError = () => Object.assign(new Error(KV_MESSAGE), { status: 503, code: 'kv_unavailable' });

function parseRedisUrl(value) {
	try {
		const parsed = new URL(value);
		return parsed.protocol === 'redis:' || parsed.protocol === 'rediss:' ? parsed : null;
	} catch {
		return null;
	}
}

function checkKey(key) {
	if (typeof key !== 'string' || key.trim() === '') throw new TypeError('key must be a non-empty string.');
	return PREFIX + key;
}

function checkValue(value) {
	if (typeof value !== 'string') throw new TypeError('value must be a string.');
	return value;
}

function checkTtl(ttl) {
	if (!Number.isInteger(ttl) || ttl <= 0) throw new TypeError('ttlMs must be a positive integer.');
	return ttl;
}

// Caveat: eviction is oldest-first within each map, so a flood of single-use keys can
// evict live replay markers and a replay then SUCCEEDS. Counters live in their own map so
// a counter flood cannot evict a marker; neither map survives a restart.
class MemoryKv {
	constructor({ maxEntries = DEFAULT_MAX_ENTRIES, sweepMs = DEFAULT_SWEEP_MS } = {}) {
		this.values = new Map();
		this.counters = new Map();
		this.maxEntries = Number.isInteger(maxEntries) && maxEntries > 0 ? maxEntries : DEFAULT_MAX_ENTRIES;
		this.sweeper = setInterval(() => this.sweep(), sweepMs);
		this.sweeper.unref?.();
	}

	#live(map, key) {
		const entry = map.get(key);
		if (!entry) return null;
		if (entry.expiresAt <= Date.now()) {
			map.delete(key);
			return null;
		}
		return entry;
	}

	#put(map, key, entry) {
		map.delete(key);
		map.set(key, entry);
		while (map.size > this.maxEntries) map.delete(map.keys().next().value);
	}

	get(key) {
		return this.#live(this.values, key)?.value ?? this.#live(this.counters, key)?.value ?? null;
	}

	set(key, value, ttlMs) {
		this.counters.delete(key);
		this.#put(this.values, key, { value, expiresAt: Date.now() + ttlMs });
	}

	del(key) {
		this.values.delete(key);
		this.counters.delete(key);
	}

	setNx(key, value, ttlMs) {
		if (this.#live(this.values, key) || this.#live(this.counters, key)) return false;
		this.#put(this.values, key, { value, expiresAt: Date.now() + ttlMs });
		return true;
	}

	getDel(key) {
		const entry = this.#live(this.values, key) ?? this.#live(this.counters, key);
		if (!entry) return null;
		this.del(key);
		return entry.value;
	}

	incrWithTtl(key, ttlMs) {
		const entry = this.#live(this.counters, key);
		const next = (entry ? Number(entry.value) || 0 : 0) + 1;
		const expiresAt = entry ? entry.expiresAt : Date.now() + ttlMs;
		this.#put(this.counters, key, { value: String(next), expiresAt });
		return next;
	}

	sweep() {
		const now = Date.now();
		for (const map of [this.values, this.counters]) {
			for (const [key, entry] of map) {
				if (entry.expiresAt <= now) map.delete(key);
			}
		}
	}

	close() {
		clearInterval(this.sweeper);
	}
}

/**
 * Build the shared store. `required` means fail closed: without a connected Redis every
 * method rejects 503 kv_unavailable instead of falling back to per-process memory.
 */
export function createKv({ redisUrl = '', required = false, commandTimeoutMs = 1_000, memory = {}, logger = console } = {}) {
	if (typeof redisUrl !== 'string') throw new TypeError('redisUrl must be a string.');
	if (!Number.isInteger(commandTimeoutMs) || commandTimeoutMs <= 0) throw new TypeError('commandTimeoutMs must be a positive integer.');
	const parsed = redisUrl.trim() === '' ? null : parseRedisUrl(redisUrl);
	if (required && !parsed) throw kvError();
	// Never log the URL: it can carry the password.
	if (!parsed && redisUrl.trim() !== '') logger.warn?.('[osionos-bridge] Redis URL is invalid; using the in-memory key/value store.');
	const mem = new MemoryKv(memory);
	const redis = parsed
		? new RedisKv(parsed, { commandTimeoutMs, reconnectMs: Math.min(1_000, Math.max(50, commandTimeoutMs)), logger })
		: null;
	let lastBackend = null;

	const currentBackend = () => (redis?.connected ? 'redis' : 'memory');
	const noteBackend = () => {
		const backend = currentBackend();
		if (lastBackend && backend !== lastBackend) logger.warn?.(`[osionos-bridge] key/value store switched to ${backend}.`);
		lastBackend = backend;
	};

	async function viaRedis(redisCall, memoryCall) {
		if (redis?.connected) {
			try {
				const result = await redisCall(redis);
				noteBackend();
				return result;
			} catch {
				// Redis answered with an error or the socket dropped: required mode fails closed.
			}
		}
		noteBackend();
		if (required) throw kvError();
		return memoryCall(mem);
	}

	const route = (key, redisCall, memoryCall) => {
		const full = checkKey(key);
		return viaRedis((client) => redisCall(client, full), (store) => memoryCall(store, full));
	};

	const withTtl = (key, ttlMs, redisCall, memoryCall) => {
		const full = checkKey(key);
		const ttl = checkTtl(ttlMs);
		return viaRedis((client) => redisCall(client, full, ttl), (store) => memoryCall(store, full, ttl));
	};

	const ready = ({ timeoutMs = READY_TIMEOUT_MS } = {}) => {
		if (!redis) return Promise.resolve();
		if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) return Promise.reject(new TypeError('ready timeoutMs must be a positive integer.'));
		if (redis.connected) return Promise.resolve();
		return new Promise((resolve, reject) => {
			let settled = false;
			const timer = setTimeout(() => {
				if (settled) return;
				settled = true;
				reject(kvError());
			}, timeoutMs);
			redis.whenReady().then(() => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve();
			});
		});
	};

	return {
		backend: currentBackend,
		ready,
		get: (key) => route(key, (client, full) => client.get(full), (store, full) => store.get(full)),
		del: (key) => route(key, (client, full) => client.del(full), (store, full) => store.del(full)).then(() => undefined),
		set: (key, value, ttlMs) => {
			const text = checkValue(value);
			return withTtl(key, ttlMs, (client, full, ttl) => client.set(full, text, ttl), (store, full, ttl) => store.set(full, text, ttl)).then(() => undefined);
		},
		setNx: (key, value, ttlMs) => {
			const text = checkValue(value);
			return withTtl(key, ttlMs, (client, full, ttl) => client.setNx(full, text, ttl), (store, full, ttl) => store.setNx(full, text, ttl));
		},
		getDel: (key) => route(key, (client, full) => client.getDel(full), (store, full) => store.getDel(full)),
		incrWithTtl: (key, ttlMs) => withTtl(key, ttlMs, (client, full, ttl) => client.incrWithTtl(full, ttl), (store, full, ttl) => store.incrWithTtl(full, ttl)),
		close: () => {
			mem.close();
			redis?.close();
		},
	};
}

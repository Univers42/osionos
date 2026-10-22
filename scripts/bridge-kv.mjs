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

import net from 'node:net';
import tls from 'node:tls';

const PREFIX = 'osb:';
const DEFAULT_MAX_ENTRIES = 50_000;
const DEFAULT_SWEEP_MS = 60_000;
const KV_MESSAGE = 'The shared key/value store is unavailable.';
const kvError = () => Object.assign(new Error(KV_MESSAGE), { status: 503, code: 'kv_unavailable' });
function parseRedisUrl(value) {
	try {
		const parsed = new URL(value);
		return parsed.protocol === 'redis:' || parsed.protocol === 'rediss:' ? parsed : null;
	} catch { return null; }
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
		if (entry.expiresAt <= Date.now()) { map.delete(key); return null; }
		return entry;
	}
	#put(map, key, entry) { map.delete(key); map.set(key, entry); while (map.size > this.maxEntries) map.delete(map.keys().next().value); }
	get(key) { return this.#live(this.values, key)?.value ?? this.#live(this.counters, key)?.value ?? null; }
	set(key, value, ttl) { this.counters.delete(key); this.#put(this.values, key, { value, expiresAt: Date.now() + ttl }); }
	del(key) { this.values.delete(key); this.counters.delete(key); }
	setNx(key, value, ttl) {
		if (this.#live(this.values, key) || this.#live(this.counters, key)) return false;
		this.#put(this.values, key, { value, expiresAt: Date.now() + ttl });
		return true;
	}
	getDel(key) {
		const entry = this.#live(this.values, key) ?? this.#live(this.counters, key);
		if (!entry) return null;
		this.del(key);
		return entry.value;
	}
	incrWithTtl(key, ttl) {
		const entry = this.#live(this.counters, key);
		const next = (entry ? Number(entry.value) || 0 : 0) + 1;
		this.#put(this.counters, key, { value: String(next), expiresAt: entry ? entry.expiresAt : Date.now() + ttl });
		return next;
	}
	sweep() {
		const now = Date.now();
		for (const map of [this.values, this.counters]) for (const [key, entry] of map) if (entry.expiresAt <= now) map.delete(key);
	}
	close() { clearInterval(this.sweeper); }
}

function parseReply(buffer, offset = 0) {
	if (offset >= buffer.length) return null;
	const type = buffer[offset];
	const lineEnd = buffer.indexOf('\r\n', offset);
	if (lineEnd === -1) return null;
	const line = buffer.toString('utf8', offset + 1, lineEnd);
	const next = lineEnd + 2;
	if (type === 0x2b) return { value: line, end: next };
	if (type === 0x2d) return { value: new Error(line), end: next };
	if (type === 0x3a) return { value: Number(line), end: next };
	if (type === 0x24) {
		const length = Number(line);
		if (length === -1) return { value: null, end: next };
		const end = next + length + 2;
		return end > buffer.length ? null : { value: buffer.toString('utf8', next, next + length), end };
	}
	if (type !== 0x2a) return null;
	const count = Number(line);
	if (count === -1) return { value: null, end: next };
	const items = [];
	let cursor = next;
	for (let index = 0; index < count; index += 1) {
		const reply = parseReply(buffer, cursor);
		if (!reply) return null;
		items.push(reply.value);
		cursor = reply.end;
	}
	return { value: items, end: cursor };
}
function encodeCommand(args) {
	let out = `*${args.length}\r\n`;
	for (const arg of args) { const value = String(arg); out += `$${Buffer.byteLength(value)}\r\n${value}\r\n`; }
	return out;
}

// Replies are matched to waiters in order, so a timeout DESTROYS the socket: dropping one
// waiter alone would hand its late reply to the next caller.
// Caveat: a timed-out command may still have run on the server and is never retried here.
class RedisKv {
	constructor(parsed, { commandTimeoutMs, reconnectMs, logger }) {
		Object.assign(this, {
			parsed, timeoutMs: commandTimeoutMs, reconnectMs, logger, socket: null,
			buffer: Buffer.alloc(0), queue: [], ready: false, closed: false,
			reconnectTimer: null, readyWaiters: [],
		});
		this.#connect();
	}
	get connected() { return this.ready; }
	whenReady() { return this.ready ? Promise.resolve() : new Promise((resolve) => this.readyWaiters.push(resolve)); }
	#markReady() {
		this.ready = true; for (const resolve of this.readyWaiters.splice(0)) resolve();
		this.logger.info?.('[osionos-bridge] connected to Redis for shared account state.');
	}
	#connect() {
		if (this.closed) return;
		const useTls = this.parsed.protocol === 'rediss:';
		const host = this.parsed.hostname; const port = Number(this.parsed.port || 6379);
		this.buffer = Buffer.alloc(0);
		const socket = useTls
			? tls.connect({ host, port, servername: host }, () => this.#handshake(socket))
			: net.connect({ host, port }, () => this.#handshake(socket));
		this.socket = socket;
		socket.on('data', (chunk) => this.#onData(chunk, socket));
		socket.on('error', () => {});
		socket.on('close', () => this.#onClose(socket));
	}
	async #handshake(socket) {
		try {
			if (this.parsed.password) {
				const args = ['AUTH'];
				if (this.parsed.username) args.push(decodeURIComponent(this.parsed.username));
				args.push(decodeURIComponent(this.parsed.password));
				await this.#send(args, socket);
			}
			const db = this.parsed.pathname.replace(/^\//, ''); if (db) await this.#send(['SELECT', db], socket);
			if (!this.closed && socket === this.socket) this.#markReady();
		} catch {
			socket.destroy();
		}
	}
	#onData(chunk, socket) {
		if (socket !== this.socket) return;
		this.buffer = Buffer.concat([this.buffer, chunk]);
		for (;;) {
			const reply = parseReply(this.buffer, 0);
			if (!reply) break;
			this.buffer = this.buffer.subarray(reply.end);
			const waiter = this.queue.shift();
			if (!waiter) continue;
			clearTimeout(waiter.timer);
			if (reply.value instanceof Error) waiter.reject(reply.value);
			else waiter.resolve(reply.value);
		}
	}
	#onClose(socket) {
		if (socket !== this.socket) return;
		this.ready = false;
		this.socket = null;
		this.buffer = Buffer.alloc(0);
		for (const waiter of this.queue.splice(0)) { clearTimeout(waiter.timer); waiter.reject(new Error('redis connection closed')); }
		if (this.closed || this.reconnectTimer) return;
		this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.#connect(); }, this.reconnectMs);
		this.reconnectTimer.unref?.();
	}
	#send(args, socket = this.socket) {
		return new Promise((resolve, reject) => {
			if (!socket || socket.destroyed) { reject(new Error('redis is not connected')); return; }
			const waiter = { resolve, reject, timer: null };
			waiter.timer = setTimeout(() => {
				const index = this.queue.indexOf(waiter);
				if (index !== -1) this.queue.splice(index, 1);
				this.ready = false;
				reject(new Error('redis command timed out'));
				socket.destroy();
			}, this.timeoutMs);
			waiter.timer.unref?.();
			this.queue.push(waiter);
			socket.write(encodeCommand(args));
		});
	}
	#command(args) { return this.ready ? this.#send(args) : Promise.reject(new Error('redis is not ready')); }
	get(key) { return this.#command(['GET', key]); }
	set(key, value, ttl) { return this.#command(['SET', key, value, 'PX', String(ttl)]); }
	del(key) { return this.#command(['DEL', key]); }
	setNx(key, value, ttl) { return this.#command(['SET', key, value, 'PX', String(ttl), 'NX']).then((reply) => reply === 'OK'); }
	getDel(key) { return this.#command(['GETDEL', key]); }
	async incrWithTtl(key, ttl) {
		// PEXPIRE NX on every call: setting it only on the first INCR leaves a key with no
		// expiry when a timeout lands between the two commands (a permanent 429).
		const count = await this.#command(['INCR', key]);
		await this.#command(['PEXPIRE', key, String(ttl), 'NX']);
		return count;
	}
	close() {
		this.closed = true;
		if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
		this.ready = false;
		const socket = this.socket;
		this.socket = null;
		for (const waiter of this.queue.splice(0)) { clearTimeout(waiter.timer); waiter.reject(new Error('redis closed')); }
		socket?.destroy();
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
	const route = (key, redisCall, memoryCall) => { const full = checkKey(key); return viaRedis((client) => redisCall(client, full), (store) => memoryCall(store, full)); };
	const withTtl = (key, ttl, redisCall, memoryCall) => { const full = checkKey(key); const expiry = checkTtl(ttl); return viaRedis((client) => redisCall(client, full, expiry), (store) => memoryCall(store, full, expiry)); };
	return {
		backend: currentBackend,
		ready: () => (redis ? redis.whenReady() : Promise.resolve()),
		get: (key) => route(key, (client, full) => client.get(full), (store, full) => store.get(full)),
		del: (key) => route(key, (client, full) => client.del(full), (store, full) => store.del(full)).then(() => undefined),
		set: (key, value, ttl) => {
			const text = checkValue(value);
			return withTtl(key, ttl, (client, full, expiry) => client.set(full, text, expiry), (store, full, expiry) => store.set(full, text, expiry)).then(() => undefined);
		},
		setNx: (key, value, ttl) => {
			const text = checkValue(value);
			return withTtl(key, ttl, (client, full, expiry) => client.setNx(full, text, expiry), (store, full, expiry) => store.setNx(full, text, expiry));
		},
		getDel: (key) => route(key, (client, full) => client.getDel(full), (store, full) => store.getDel(full)),
		incrWithTtl: (key, ttl) => withTtl(key, ttl, (client, full, expiry) => client.incrWithTtl(full, expiry), (store, full, expiry) => store.incrWithTtl(full, expiry)),
		close: () => { mem.close(); redis?.close(); },
	};
}

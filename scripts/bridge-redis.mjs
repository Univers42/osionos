/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-redis.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Zero-dependency RESP client, kept in its own file so the kv facade stays small.
 * Imported by bridge-kv.mjs only; no other bridge module should reach for it.
 */

import net from 'node:net';
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';
import { encodeCommand, parseReply } from './bridge-resp.mjs';

/**
 * Replies are matched to waiters in order, so a timeout DESTROYS the socket: dropping one
 * waiter alone would hand its late reply to the next caller.
 * Caveat: a timed-out command may still have run on the server and is never retried here.
 */
export class RedisKv {
	constructor(parsed, { commandTimeoutMs, reconnectMs, logger }) {
		this.parsed = parsed;
		this.timeoutMs = commandTimeoutMs;
		this.reconnectMs = reconnectMs;
		this.logger = logger;
		this.socket = null;
		this.buffer = Buffer.alloc(0);
		this.queue = [];
		this.ready = false;
		this.closed = false;
		this.reconnectTimer = null;
		this.readyWaiters = [];
		this.warnedState = null;
		this.#connect();
	}

	get connected() {
		return this.ready;
	}

	// One warning per connection state: a dead Redis must not flood the log.
	#warn(state, message) {
		if (this.warnedState === state) return;
		this.warnedState = state;
		this.logger.warn?.(`[osionos-bridge] ${message}`);
	}

	// A waiter that gave up leaves the queue: the next successful connection must not
	// resurrect it, and the timeout timer must not hold the process open.
	whenReady({ timeoutMs = 5_000 } = {}) {
		if (this.ready) return Promise.resolve();
		return new Promise((resolve, reject) => {
			const waiter = { resolve, reject, timer: null };
			waiter.timer = setTimeout(() => {
				const index = this.readyWaiters.indexOf(waiter);
				if (index !== -1) this.readyWaiters.splice(index, 1);
				reject(new Error('redis connection timed out'));
			}, timeoutMs);
			waiter.timer.unref?.();
			this.readyWaiters.push(waiter);
		});
	}

	#markReady() {
		this.ready = true;
		this.warnedState = null;
		this.socket?.setTimeout(0);
		for (const waiter of this.readyWaiters.splice(0)) {
			clearTimeout(waiter.timer);
			waiter.resolve();
		}
		this.logger.info?.('[osionos-bridge] connected to Redis for shared account state.');
	}

	#connect() {
		if (this.closed) return;
		const useTls = this.parsed.protocol === 'rediss:';
		// A bracketed IPv6 host is an address, not a DNS name.
		const host = this.parsed.hostname.replace(/^\[|\]$/g, '');
		const port = Number(this.parsed.port || 6379);
		this.buffer = Buffer.alloc(0);
		const socket = useTls
			? tls.connect({ host, port, servername: host }, () => this.#handshake(socket))
			: net.connect({ host, port }, () => this.#handshake(socket));
		this.socket = socket;
		// A black-holed host would wait for the OS connect timeout (~127 s): the socket
		// timeout bounds the attempt until the handshake completes.
		// Caveat: the attempt is abandoned after one command timeout, so a Redis that
		// accepts the TCP connection but stalls the handshake is retried, never waited on.
		socket.setTimeout(this.timeoutMs);
		socket.on('data', (chunk) => this.#onData(chunk, socket));
		socket.on('timeout', () => {
			this.#warn('connect-timeout', 'Redis connection attempt timed out.');
			this.ready = false;
			socket.destroy();
		});
		socket.on('error', (error) => {
			// The error carries a host but not the URL (and its password): log the code only.
			this.#warn('unreachable', `Redis socket error: ${error?.code ?? 'unknown'}.`);
		});
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
			const database = this.parsed.pathname.replace(/^\//, '');
			if (database) await this.#send(['SELECT', database], socket);
		} catch {
			// The credentials or the database were refused: say it once, never the URL.
			this.#warn('handshake', 'Redis handshake failed (check the credentials and the database).');
			socket.destroy();
			return;
		}
		try {
			await this.#probe(socket);
		} catch {
			this.#warn('probe', 'Redis refuses the commands the shared store needs (SET NX, PEXPIRE NX, GETDEL); the store stays unavailable.');
			socket.destroy();
			return;
		}
		if (!this.closed && socket === this.socket) this.#markReady();
	}

	/**
	 * The three commands the store needs, run before the client is ever used. A
	 * least-privilege ACL user may read and write its own keys and still be refused
	 * PEXPIRE NX (Redis 7.0) or GETDEL (6.2), and INFO is no help: it answers NOPERM for
	 * the same user. So the probe asks for the commands themselves.
	 * Caveat: the probe writes one key with a 5 s TTL, so a Redis that forbids writes
	 * fails the connection even when it would have served reads.
	 */
	async #probe(socket) {
		const key = `osb:probe:${randomUUID()}`;
		await this.#send(['SET', key, '1', 'PX', '5000', 'NX'], socket);
		await this.#send(['PEXPIRE', key, '5000', 'NX'], socket);
		await this.#send(['GETDEL', key], socket);
	}

	#onData(chunk, socket) {
		if (socket !== this.socket) return;
		this.buffer = Buffer.concat([this.buffer, chunk]);
		try {
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
		} catch (error) {
			// A malformed frame desynchronises the stream: every waiter fails and the
			// socket goes, because the rest of the reply can no longer be trusted.
			this.#failQueue(error);
			this.ready = false;
			socket.destroy();
		}
	}

	#failQueue(error) {
		for (const waiter of this.queue.splice(0)) {
			clearTimeout(waiter.timer);
			waiter.reject(error);
		}
	}

	#onClose(socket) {
		if (socket !== this.socket) return;
		this.ready = false;
		this.socket = null;
		this.buffer = Buffer.alloc(0);
		this.#failQueue(new Error('redis connection closed'));
		if (this.closed || this.reconnectTimer) return;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.#connect();
		}, this.reconnectMs);
		this.reconnectTimer.unref?.();
	}

	#send(args, socket = this.socket) {
		return new Promise((resolve, reject) => {
			if (!socket || socket.destroyed) {
				reject(new Error('redis is not connected'));
				return;
			}
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

	#command(args) {
		if (!this.ready) return Promise.reject(new Error('redis is not ready'));
		return this.#send(args);
	}

	get(key) {
		return this.#command(['GET', key]);
	}

	getMany(keys) {
		return this.#command(['MGET', ...keys]);
	}

	set(key, value, ttlMs) {
		return this.#command(['SET', key, value, 'PX', String(ttlMs)]);
	}

	del(key) {
		return this.#command(['DEL', key]);
	}

	setNx(key, value, ttlMs) {
		return this.#command(['SET', key, value, 'PX', String(ttlMs), 'NX']).then((reply) => reply === 'OK');
	}

	getDel(key) {
		return this.#command(['GETDEL', key]);
	}

	async incrWithTtl(key, ttlMs) {
		// PEXPIRE NX on every call: setting it only on the first INCR leaves a key with no
		// expiry when a timeout lands between the two commands (a permanent 429).
		const count = await this.#command(['INCR', key]);
		await this.#command(['PEXPIRE', key, String(ttlMs), 'NX']);
		return count;
	}

	close() {
		this.closed = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.ready = false;
		const socket = this.socket;
		this.socket = null;
		this.#failQueue(new Error('redis closed'));
		for (const waiter of this.readyWaiters.splice(0)) {
			clearTimeout(waiter.timer);
			waiter.reject(new Error('redis closed'));
		}
		socket?.destroy();
	}
}

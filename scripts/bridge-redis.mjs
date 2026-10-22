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

// Minimal RESP parser: { value, end } or null while the reply is incomplete.
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
		if (end > buffer.length) return null;
		return { value: buffer.toString('utf8', next, next + length), end };
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
	for (const arg of args) {
		const value = String(arg);
		out += `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
	}
	return out;
}

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
		this.#connect();
	}

	get connected() {
		return this.ready;
	}

	whenReady() {
		if (this.ready) return Promise.resolve();
		return new Promise((resolve) => this.readyWaiters.push(resolve));
	}

	#markReady() {
		this.ready = true;
		for (const resolve of this.readyWaiters.splice(0)) resolve();
		this.logger.info?.('[osionos-bridge] connected to Redis for shared account state.');
	}

	#connect() {
		if (this.closed) return;
		const useTls = this.parsed.protocol === 'rediss:';
		const host = this.parsed.hostname;
		const port = Number(this.parsed.port || 6379);
		this.buffer = Buffer.alloc(0);
		const socket = useTls
			? tls.connect({ host, port, servername: host }, () => this.#handshake(socket))
			: net.connect({ host, port }, () => this.#handshake(socket));
		this.socket = socket;
		socket.on('data', (chunk) => this.#onData(chunk, socket));
		// The error can carry a host but not the URL (and its password); log the code only.
		socket.on('error', (error) => {
			this.logger.warn?.(`[osionos-bridge] Redis socket error: ${error?.code ?? 'unknown'}.`);
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
			const db = this.parsed.pathname.replace(/^\//, '');
			if (db) await this.#send(['SELECT', db], socket);
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
		for (const waiter of this.queue.splice(0)) {
			clearTimeout(waiter.timer);
			waiter.reject(new Error('redis connection closed'));
		}
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
		for (const waiter of this.queue.splice(0)) {
			clearTimeout(waiter.timer);
			waiter.reject(new Error('redis closed'));
		}
		socket?.destroy();
	}
}

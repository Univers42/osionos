/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   fake-redis.mjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Fake RESP server for the bridge kv tests. It records every command and answers
 * strictly in order per connection, as Redis does: a delayed reply holds back every
 * later reply written to the same socket. It can also drop a connection, answer with a
 * malformed frame or split one reply into chunks.
 *
 * The client's capability probe (SET NX, PEXPIRE NX, GETDEL on an `osb:probe:` key) is
 * connection setup, not store traffic: a real Redis answers it, so this fake answers it
 * too and keeps it out of the recorded commands — the exact-command assertions stay about
 * the store's API. `probe: false` hands the probe to the test's own handler instead.
 */

import net from 'node:net';

export const simple = (value) => `+${value}\r\n`;
export const integer = (value) => `:${value}\r\n`;
export const bulk = (value) => (value === null ? '$-1\r\n' : `$${Buffer.byteLength(value)}\r\n${value}\r\n`);

const PROBE_PREFIX = 'osb:probe:';

function isProbe(command) {
	return String(command[1] ?? '').startsWith(PROBE_PREFIX);
}

// The three answers of the probe: +OK, :1 and the value it read back.
function probeReply(command) {
	if (command[0] === 'SET') return { data: simple('OK') };
	if (command[0] === 'PEXPIRE') return { data: integer(1) };
	return { data: bulk('1') };
}

function decode(buffer) {
	const commands = [];
	let at = 0;
	for (;;) {
		if (buffer[at] !== 0x2a) return { commands, rest: buffer.subarray(at) };
		const lineEnd = buffer.indexOf('\r\n', at);
		if (lineEnd === -1) return { commands, rest: buffer.subarray(at) };
		const count = Number(buffer.toString('utf8', at + 1, lineEnd));
		const args = [];
		let cursor = lineEnd + 2;
		for (let index = 0; index < count; index += 1) {
			if (buffer[cursor] !== 0x24) return { commands, rest: buffer.subarray(at) };
			const lengthEnd = buffer.indexOf('\r\n', cursor);
			if (lengthEnd === -1) return { commands, rest: buffer.subarray(at) };
			const length = Number(buffer.toString('utf8', cursor + 1, lengthEnd));
			const start = lengthEnd + 2;
			if (start + length + 2 > buffer.length) return { commands, rest: buffer.subarray(at) };
			args.push(buffer.toString('utf8', start, start + length));
			cursor = start + length + 2;
		}
		commands.push(args);
		at = cursor;
	}
}

export async function respServer(handle, { probe = true } = {}) {
	const commands = [];
	const connectionIds = [];
	const sockets = new Set();
	const state = { connections: 0 };
	const server = net.createServer((socket) => {
		state.connections += 1;
		const connectionId = state.connections;
		sockets.add(socket);
		socket.on('error', () => {});
		socket.on('close', () => sockets.delete(socket));
		let buffer = Buffer.alloc(0);
		let chain = Promise.resolve();
		socket.on('data', (chunk) => {
			buffer = Buffer.concat([buffer, chunk]);
			const parsed = decode(buffer);
			buffer = parsed.rest;
			for (const command of parsed.commands) {
				const probed = probe && isProbe(command);
				if (!probed) {
					commands.push(command);
					connectionIds.push(connectionId);
				}
				const reply = probed ? probeReply(command) : handle(command, commands.length - 1);
				if (!reply) continue;
				if (reply.drop) {
					socket.destroy();
					continue;
				}
				chain = chain.then(() => new Promise((resolve) => {
					if (reply.raw !== undefined) {
						if (!socket.destroyed) socket.write(reply.raw);
						resolve();
						return;
					}
					const chunks = reply.chunks ?? [reply.data];
					const gap = reply.gap ?? 0;
					const send = (index) => {
						if (!socket.destroyed) socket.write(chunks[index]);
						if (index + 1 < chunks.length) setTimeout(() => send(index + 1), gap);
						else resolve();
					};
					if (reply.delay) setTimeout(() => send(0), reply.delay);
					else send(0);
				}));
			}
		});
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address();
	return {
		commands,
		connectionIds,
		get connections() { return state.connections; },
		url: `redis://127.0.0.1:${port}`,
		close: async () => {
			for (const socket of sockets) socket.destroy();
			await new Promise((resolve) => server.close(resolve));
		},
	};
}

/** A server that writes one payload once, as a single socket write. */
export async function singleWriteServer(payload) {
	const sockets = new Set();
	const server = net.createServer((socket) => {
		sockets.add(socket);
		socket.on('error', () => {});
		let buffer = Buffer.alloc(0);
		let written = false;
		socket.on('data', (chunk) => {
			buffer = Buffer.concat([buffer, chunk]);
			const parsed = decode(buffer);
			buffer = parsed.rest;
			for (const command of parsed.commands) {
				// The capability probe is answered here: the payload belongs to the first
				// command of the store's own API.
				if (isProbe(command)) {
					if (!socket.destroyed) socket.write(probeReply(command).data);
					continue;
				}
				if (!written && !socket.destroyed) {
					written = true;
					socket.write(payload);
				}
			}
		});
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address();
	return {
		url: `redis://127.0.0.1:${port}`,
		close: async () => {
			for (const socket of sockets) socket.destroy();
			await new Promise((resolve) => server.close(resolve));
		},
	};
}

/** A tiny in-memory Redis for the commands the kv store sends. */
export function storeHandler() {
	const store = new Map();
	return ([name, key, ...rest]) => {
		if (name === 'SET') {
			if (rest.includes('NX') && store.has(key)) return { data: bulk(null) };
			store.set(key, rest[0]);
			return { data: simple('OK') };
		}
		if (name === 'GET') return { data: bulk(store.get(key) ?? null) };
		if (name === 'MGET') {
			const keys = [key, ...rest];
			return { data: `*${keys.length}\r\n${keys.map((each) => bulk(store.get(each) ?? null)).join('')}` };
		}
		if (name === 'GETDEL') {
			const value = store.get(key) ?? null;
			store.delete(key);
			return { data: bulk(value) };
		}
		if (name === 'DEL') return { data: integer(store.delete(key) ? 1 : 0) };
		if (name === 'INCR') {
			const next = Number(store.get(key) ?? 0) + 1;
			store.set(key, String(next));
			return { data: integer(next) };
		}
		if (name === 'PEXPIRE') return { data: integer(store.has(key) ? 1 : 0) };
		return { data: '-ERR unknown command\r\n' };
	};
}

/** Reject when a promise does not settle, so a broken client fails instead of hanging. */
export async function withDeadline(promise, ms, label = 'promise') {
	let timer;
	const deadline = new Promise((_, reject) => {
		timer = setTimeout(() => reject(new Error(`${label} did not settle in ${ms} ms`)), ms);
	});
	try {
		return await Promise.race([promise, deadline]);
	} finally {
		clearTimeout(timer);
	}
}

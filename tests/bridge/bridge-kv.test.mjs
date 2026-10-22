/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-kv.test.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Pin the exact wire commands, the two backends and the fail-closed switch. A timed-out
// reply must never be handed to the next caller, so the fake server records every command.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createKv } from '../../scripts/bridge-kv.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const unavailable = (error) => error?.status === 503 && error?.code === 'kv_unavailable';
const simple = (value) => `+${value}\r\n`;
const integer = (value) => `:${value}\r\n`;
const bulk = (value) => (value === null ? '$-1\r\n' : `$${Buffer.byteLength(value)}\r\n${value}\r\n`);

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

async function respServer(handle) {
	const commands = [];
	const sockets = new Set();
	const server = net.createServer((socket) => {
		sockets.add(socket);
		socket.on('error', () => {});
		socket.on('close', () => sockets.delete(socket));
		let buffer = Buffer.alloc(0);
		socket.on('data', (chunk) => {
			buffer = Buffer.concat([buffer, chunk]);
			const parsed = decode(buffer);
			buffer = parsed.rest;
			for (const command of parsed.commands) {
				commands.push(command);
				const reply = handle(command, commands.length - 1);
				if (!reply) continue;
				const write = () => { if (!socket.destroyed) socket.write(reply.data); };
				if (reply.delay) setTimeout(write, reply.delay); else write();
			}
		});
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address();
	return {
		commands,
		url: `redis://127.0.0.1:${port}`,
		close: async () => {
			for (const socket of sockets) socket.destroy();
			await new Promise((resolve) => server.close(resolve));
		},
	};
}

function storeHandler() {
	const store = new Map();
	return ([name, key, ...rest]) => {
		if (name === 'SET') {
			if (rest.includes('NX') && store.has(key)) return { data: bulk(null) };
			store.set(key, rest[0]);
			return { data: simple('OK') };
		}
		if (name === 'GET') return { data: bulk(store.get(key) ?? null) };
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
		return { data: `-ERR unknown command\r\n` };
	};
}

describe('createKv memory backend', () => {
	it('expires a value after its ttl and deletes it on demand', async () => {
		const kv = createKv({ memory: { sweepMs: 5 } });
		await kv.set('short', 'value', 20);
		assert.equal(await kv.get('short'), 'value');
		await sleep(40);
		assert.equal(await kv.get('short'), null);
		await kv.set('gone', 'value', 1_000);
		await kv.del('gone');
		assert.equal(await kv.get('gone'), null);
		kv.close();
	});

	it('lets exactly one concurrent setNx win and consumes getDel once', async () => {
		const kv = createKv({});
		const [first, second] = await Promise.all([kv.setNx('race', 'a', 1_000), kv.setNx('race', 'b', 1_000)]);
		assert.deepEqual([first, second].filter(Boolean).length, 1);
		assert.equal(await kv.setNx('race', 'c', 1_000), false);
		assert.equal(await kv.getDel('race'), first ? 'a' : 'b');
		assert.equal(await kv.getDel('race'), null);
		kv.close();
	});

	it('counts in a fixed window and restarts after it expires', async () => {
		const kv = createKv({});
		assert.deepEqual([await kv.incrWithTtl('hits', 30), await kv.incrWithTtl('hits', 30)], [1, 2]);
		await sleep(45);
		assert.equal(await kv.incrWithTtl('hits', 30), 1);
		kv.close();
	});

	it('keeps a counter flood from evicting a live single-use key', async () => {
		const kv = createKv({ memory: { maxEntries: 4 } });
		await kv.set('replay', 'marker', 60_000);
		for (let index = 0; index < 40; index += 1) await kv.incrWithTtl(`flood:${index}`, 60_000);
		assert.equal(await kv.getDel('replay'), 'marker');
		kv.close();
	});

	it('refuses an empty key, a non-string value and a bad ttl', async () => {
		const kv = createKv({});
		assert.throws(() => kv.get(''), TypeError);
		assert.throws(() => kv.set('k', 1, 1_000), TypeError);
		assert.throws(() => kv.set('k', 'v', 0), TypeError);
		assert.throws(() => kv.set('k', 'v', 1.5), TypeError);
		assert.throws(() => kv.setNx('k', 'v', -1), TypeError);
		assert.throws(() => kv.incrWithTtl('k', 'soon'), TypeError);
		kv.close();
	});
});

describe('createKv redis backend', () => {
	it('sends the exact millisecond commands with the osb prefix', async () => {
		const server = await respServer(storeHandler());
		const kv = createKv({ redisUrl: server.url });
		await kv.ready();
		assert.equal(kv.backend(), 'redis');
		await kv.set('k', 'v', 1_500);
		assert.equal(await kv.setNx('n', 'v', 1_500), true);
		assert.equal(await kv.getDel('k'), 'v');
		assert.equal(await kv.incrWithTtl('c', 2_000), 1);
		assert.deepEqual(server.commands, [
			['SET', 'osb:k', 'v', 'PX', '1500'],
			['SET', 'osb:n', 'v', 'PX', '1500', 'NX'],
			['GETDEL', 'osb:k'],
			['INCR', 'osb:c'],
			['PEXPIRE', 'osb:c', '2000', 'NX'],
		]);
		kv.close();
		await server.close();
	});

	it('shares setNx and getDel between two replicas', async () => {
		const server = await respServer(storeHandler());
		const replicaA = createKv({ redisUrl: server.url });
		const replicaB = createKv({ redisUrl: server.url });
		await Promise.all([replicaA.ready(), replicaB.ready()]);
		assert.equal(await replicaA.setNx('shared', 'v', 1_000), true);
		assert.equal(await replicaB.setNx('shared', 'v2', 1_000), false);
		assert.equal(await replicaB.getDel('shared'), 'v');
		assert.equal(await replicaA.getDel('shared'), null);
		replicaA.close();
		replicaB.close();
		await server.close();
	});

	it('destroys the socket on timeout so the next call gets its own reply', async () => {
		let first = true;
		const server = await respServer(() => {
			if (!first) return { data: bulk('second') };
			first = false;
			return { data: bulk('first'), delay: 150 };
		});
		const kv = createKv({ redisUrl: server.url, required: true, commandTimeoutMs: 40 });
		await kv.ready();
		await assert.rejects(kv.get('k'), unavailable);
		await kv.ready();
		assert.equal(await kv.get('k'), 'second');
		kv.close();
		await server.close();
	});

	it('rejects every method when a required Redis is down', async () => {
		const server = await respServer(storeHandler());
		const url = server.url;
		await server.close();
		const kv = createKv({ redisUrl: url, required: true, commandTimeoutMs: 100 });
		const calls = [
			() => kv.get('k'), () => kv.del('k'), () => kv.set('k', 'v', 1_000),
			() => kv.setNx('k', 'v', 1_000), () => kv.getDel('k'), () => kv.incrWithTtl('k', 1_000),
		];
		for (const call of calls) await assert.rejects(call(), unavailable);
		kv.close();
	});

	it('falls back to memory when Redis is not required', async () => {
		const server = await respServer(storeHandler());
		const url = server.url;
		await server.close();
		const kv = createKv({ redisUrl: url });
		assert.equal(kv.backend(), 'memory');
		await kv.set('k', 'v', 1_000);
		assert.equal(await kv.get('k'), 'v');
		kv.close();
	});

	it('gives up on a server that never answers within the command timeout', async () => {
		const server = await respServer(() => null);
		const kv = createKv({ redisUrl: server.url, required: true, commandTimeoutMs: 60 });
		await kv.ready();
		const started = Date.now();
		await assert.rejects(kv.get('k'), unavailable);
		assert.ok(Date.now() - started < 260, 'the command timeout bounds the wait');
		kv.close();
		await server.close();
	});

	it('refuses a required store without a parseable redis url', () => {
		assert.throws(() => createKv({ redisUrl: '', required: true }), unavailable);
		assert.throws(() => createKv({ redisUrl: 'not a url', required: true }), unavailable);
	});
});

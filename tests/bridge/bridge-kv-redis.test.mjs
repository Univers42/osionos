/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-kv-redis.test.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The wire contract of the shared store: exact commands, fail-closed errors, and the
// connection handling a hung or malformed Redis forces.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createKv } from '../../scripts/bridge-kv.mjs';
import { bulk, respServer, singleWriteServer, storeHandler, withDeadline } from './fake-redis.mjs';

const unavailable = (error) => error?.status === 503 && error?.code === 'kv_unavailable';

// The ready timeout is unref'd (it must never hold the process open), so a test that
// waits for it has to keep the event loop alive meanwhile.
async function withLoopHeld(run) {
	const hold = setInterval(() => {}, 20);
	try {
		return await run();
	} finally {
		clearInterval(hold);
	}
}

const quietLogger = () => ({ warn: () => {}, info: () => {}, error: () => {} });

describe('createKv redis backend', () => {
	it('sends the exact millisecond commands with the osb prefix', async (t) => {
		const server = await respServer(storeHandler());
		const kv = createKv({ redisUrl: server.url });
		t.after(async () => { kv.close(); await server.close(); });
		await kv.ready({ timeoutMs: 1_000 });
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
	});

	it('sets the counter expiry on every increment', async (t) => {
		const server = await respServer(storeHandler());
		const kv = createKv({ redisUrl: server.url });
		t.after(async () => { kv.close(); await server.close(); });
		await kv.ready({ timeoutMs: 1_000 });
		await kv.incrWithTtl('c', 2_000);
		await kv.incrWithTtl('c', 2_000);
		assert.deepEqual(
			server.commands.filter((command) => command[0] === 'PEXPIRE'),
			[['PEXPIRE', 'osb:c', '2000', 'NX'], ['PEXPIRE', 'osb:c', '2000', 'NX']],
		);
	});

	it('shares setNx and getDel between two replicas', async (t) => {
		const server = await respServer(storeHandler());
		const replicaA = createKv({ redisUrl: server.url });
		const replicaB = createKv({ redisUrl: server.url });
		t.after(async () => { replicaA.close(); replicaB.close(); await server.close(); });
		await Promise.all([replicaA.ready({ timeoutMs: 1_000 }), replicaB.ready({ timeoutMs: 1_000 })]);
		assert.equal(await replicaA.setNx('shared', 'v', 1_000), true);
		assert.equal(await replicaB.setNx('shared', 'v2', 1_000), false);
		assert.equal(await replicaB.getDel('shared'), 'v');
		assert.equal(await replicaA.getDel('shared'), null);
	});

	it('destroys the socket on timeout so the next call gets its own reply', async (t) => {
		let first = true;
		const server = await respServer(() => {
			if (!first) return { data: bulk('second') };
			first = false;
			return { data: bulk('first'), delay: 150 };
		});
		const kv = createKv({ redisUrl: server.url, required: true, commandTimeoutMs: 40 });
		t.after(async () => { kv.close(); await server.close(); });
		await kv.ready({ timeoutMs: 1_000 });
		await assert.rejects(kv.get('k'), unavailable);
		await kv.ready({ timeoutMs: 1_000 });
		assert.equal(await kv.get('k'), 'second');
		assert.equal(server.connections, 2, 'the timed-out connection was replaced');
		assert.deepEqual(server.connectionIds, [1, 2]);
	});

	it('fails every waiter on a malformed frame and recovers on the next connection', async (t) => {
		for (const frame of ['$-7\r\n', '$abc\r\n', '*-5\r\n', '*x\r\n']) {
			const server = await respServer((command, index) => (index === 0 ? { raw: frame } : { data: bulk('ok') }));
			const kv = createKv({ redisUrl: server.url, required: true, commandTimeoutMs: 300 });
			t.after(async () => { kv.close(); await server.close(); });
			await kv.ready({ timeoutMs: 1_000 });
			const started = Date.now();
			await assert.rejects(kv.get('k'), unavailable);
			assert.ok(Date.now() - started < 200, 'the malformed frame fails the caller at once');
			await kv.ready({ timeoutMs: 2_000 });
			assert.equal(await kv.get('k'), 'ok');
		}
	});

	it('turns a redis reply error into a 503 in both modes', async (t) => {
		const server = await respServer(([name]) => (
			name === 'SET' || name === 'GETDEL' ? { data: '-READONLY\r\n' } : { data: bulk(null) }
		));
		const requiredKv = createKv({ redisUrl: server.url, required: true });
		const looseKv = createKv({ redisUrl: server.url });
		t.after(async () => { requiredKv.close(); looseKv.close(); await server.close(); });
		await requiredKv.ready({ timeoutMs: 1_000 });
		await assert.rejects(requiredKv.setNx('k', 'v', 1_000), unavailable);
		await assert.rejects(requiredKv.getDel('k'), unavailable);
		await looseKv.ready({ timeoutMs: 1_000 });
		await assert.rejects(looseKv.setNx('k', 'v', 1_000), unavailable);
	});

	it('answers five pipelined replies from a single write', async (t) => {
		const payload = ['v1', 'v2', 'v3', 'v4', 'v5'].map(bulk).join('');
		const server = await singleWriteServer(payload);
		const kv = createKv({ redisUrl: server.url, required: true, commandTimeoutMs: 1_000 });
		t.after(async () => { kv.close(); await server.close(); });
		await kv.ready({ timeoutMs: 1_000 });
		const values = await withDeadline(
			Promise.all([kv.get('a'), kv.get('b'), kv.get('c'), kv.get('d'), kv.get('e')]),
			2_000,
			'the pipelined replies',
		);
		assert.deepEqual(values, ['v1', 'v2', 'v3', 'v4', 'v5']);
	});

	it('fails the caller when the connection drops mid-command', async (t) => {
		const server = await respServer((command, index) => (index === 0 ? { drop: true } : { data: bulk('ok') }));
		const kv = createKv({ redisUrl: server.url, required: true, commandTimeoutMs: 300 });
		t.after(async () => { kv.close(); await server.close(); });
		await kv.ready({ timeoutMs: 1_000 });
		const started = Date.now();
		await assert.rejects(kv.get('k'), unavailable);
		assert.ok(Date.now() - started < 200, 'the drop fails the in-flight caller at once');
		await kv.ready({ timeoutMs: 2_000 });
		assert.equal(await kv.get('k'), 'ok');
	});

	it('gives up on a server that never answers within the command timeout', async (t) => {
		const server = await respServer(() => null);
		const kv = createKv({ redisUrl: server.url, required: true, commandTimeoutMs: 60 });
		t.after(async () => { kv.close(); await server.close(); });
		await kv.ready({ timeoutMs: 1_000 });
		const started = Date.now();
		await assert.rejects(kv.get('k'), unavailable);
		assert.ok(Date.now() - started < 260, 'the command timeout bounds the wait');
	});

	it('resolves ready on connect and rejects it after the timeout', async (t) => {
		const server = await respServer(storeHandler());
		const up = createKv({ redisUrl: server.url, required: true });
		t.after(() => up.close());
		await up.ready({ timeoutMs: 1_000 });
		assert.equal(up.backend(), 'redis');
		up.close();
		const url = server.url;
		await server.close();
		const down = createKv({ redisUrl: url, required: true, commandTimeoutMs: 100 });
		t.after(() => down.close());
		await withLoopHeld(() => assert.rejects(down.ready({ timeoutMs: 100 }), unavailable));
	});

	it('leaves no ready waiter behind after a hundred timeouts', async (t) => {
		const server = await respServer(storeHandler());
		const url = server.url;
		await server.close();
		const kv = createKv({ redisUrl: url, required: true, commandTimeoutMs: 100 });
		t.after(() => kv.close());
		const results = await withLoopHeld(() => Promise.allSettled(
			Array.from({ length: 100 }, () => kv.ready({ timeoutMs: 20 })),
		));
		assert.equal(results.filter((result) => result.status === 'rejected').length, 100);
		assert.equal(kv.pendingReadyWaiters(), 0);
	});

	it('gives up on a black-holed host instead of the OS connect timeout', async (t) => {
		const warnings = [];
		const logger = { ...quietLogger(), warn: (message) => warnings.push(message) };
		const kv = createKv({ redisUrl: 'redis://10.255.255.1:6379', required: true, commandTimeoutMs: 150, logger });
		t.after(() => kv.close());
		await withLoopHeld(() => assert.rejects(kv.ready({ timeoutMs: 1_000 }), unavailable));
		assert.ok(warnings.length >= 1, 'the dead host is reported');
	});

	it('refuses a required store without a parseable redis url', () => {
		assert.throws(() => createKv({ redisUrl: '', required: true }), unavailable);
		assert.throws(() => createKv({ redisUrl: 'not a url', required: true }), unavailable);
		assert.throws(() => createKv({ redisUrl: 'redis://', required: true }), unavailable);
		assert.throws(() => createKv({ redisUrl: 'redis:foo', required: true }), unavailable);
		assert.throws(() => createKv({ redisUrl: 'redis://host/db', required: true }), unavailable);
	});

	it('strips the brackets of an ipv6 host before connecting', async (t) => {
		const warnings = [];
		const logger = { ...quietLogger(), warn: (message) => warnings.push(message) };
		const kv = createKv({ redisUrl: 'redis://[::1]:6379', required: true, commandTimeoutMs: 200, logger });
		t.after(() => kv.close());
		await withLoopHeld(() => assert.rejects(kv.ready({ timeoutMs: 500 }), unavailable));
		assert.equal(warnings.some((message) => message.includes('ENOTFOUND')), false, 'the host is an address, not a name');
	});
});

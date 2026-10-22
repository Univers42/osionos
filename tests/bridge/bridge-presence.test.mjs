/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-presence.test.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Presence in the key/value store: the beat is a store write, the database write happens
// at most once per user per ten minutes, and the online window lives in one file.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createKv } from '../../scripts/bridge-kv.mjs';
import { createProfileHandler } from '../../scripts/bridge-profile.mjs';
import { onlineAmong, presenceKey, PRESENCE_TTL_MS, recordHeartbeat } from '../../scripts/bridge-presence.mjs';
import { respServer, storeHandler } from './fake-redis.mjs';

const USER = '11111111-1111-4111-8111-111111111111';
const PEER = '22222222-2222-4222-8222-222222222222';
const CONFIG = { baasUrl: 'http://baas.test', serviceKey: 'svc-key', allowedOrigin: '*' };
const START = Date.parse('2026-10-22T12:00:00.000Z');

/** The PostgREST stand-in: it records the writes and answers an empty list. */
function baasStub() {
	const calls = [];
	const fetchImpl = async (url, init = {}) => {
		calls.push({ method: init.method ?? 'GET', url: String(url), body: init.body ? JSON.parse(init.body) : null });
		return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
	};
	return { fetchImpl, calls, patches: () => calls.filter((call) => call.method === 'PATCH') };
}

/** A store whose every command fails: the bridge must survive it. */
function brokenKv() {
	const fail = async () => { throw Object.assign(new Error('The shared key/value store is unavailable.'), { status: 503, code: 'kv_unavailable' }); };
	return { get: fail, getMany: fail, set: fail, setNx: fail, getDel: fail, incrWithTtl: fail, del: fail };
}

function response() {
	const captured = { status: 0, body: null };
	return {
		captured,
		writeHead: (status) => { captured.status = status; },
		end: (text) => { captured.body = text ? JSON.parse(text) : null; },
	};
}

async function beat(handler) {
	const request = { method: 'POST', headers: { authorization: 'Bearer test' } };
	const answer = response();
	await handler(new URL('http://bridge.test/api/profile/heartbeat'), request, answer);
	return answer.captured;
}

// The clock is the bridge's own Date.now, so the mocked Date is the injected clock.
const profileHandler = (fetchImpl, kv) => createProfileHandler({
	config: CONFIG,
	verifySession: () => ({ userId: USER }),
	fetchImpl,
	kv,
});

describe('the heartbeat', () => {
	it('20 beats over 10 minutes write the database column exactly once', async (t) => {
		t.mock.timers.enable({ apis: ['Date'], now: START });
		const kv = createKv({});
		const baas = baasStub();
		const handler = profileHandler(baas.fetchImpl, kv);
		for (let beat2 = 0; beat2 < 20; beat2 += 1) {
			const answer = await beat(handler);
			assert.equal(answer.status, 204);
			t.mock.timers.tick(30_000);
		}
		assert.equal(baas.patches().length, 1);
		assert.equal(baas.patches()[0].body.last_seen_at, new Date(START).toISOString());
		kv.close();
	});

	it('the eleventh beat inside one minute is a 429', async (t) => {
		t.mock.timers.enable({ apis: ['Date'], now: START });
		const kv = createKv({});
		const baas = baasStub();
		const handler = profileHandler(baas.fetchImpl, kv);
		for (let beat2 = 0; beat2 < 10; beat2 += 1) {
			assert.equal((await beat(handler)).status, 204);
			t.mock.timers.tick(1_000);
		}
		const limited = await beat(handler);
		assert.equal(limited.status, 429);
		assert.equal(limited.body.ok, false);
		assert.equal(baas.patches().length, 1);
		kv.close();
	});

	it('a store that is down answers 204 and writes nothing', async (t) => {
		t.mock.timers.enable({ apis: ['Date'], now: START });
		const baas = baasStub();
		const handler = profileHandler(baas.fetchImpl, brokenKv());
		const answer = await beat(handler);
		assert.equal(answer.status, 204);
		assert.deepEqual(baas.patches(), []);
	});

	it('a store without a getMany answers an empty online set', async () => {
		assert.deepEqual([...(await onlineAmong(null, [USER]))], []);
		assert.deepEqual([...(await onlineAmong({ getMany: async () => { throw new Error('down'); } }, [USER]))], []);
	});
});

describe('onlineAmong', () => {
	it('is online for 89 seconds after a beat and offline at 91', async (t) => {
		t.mock.timers.enable({ apis: ['Date'], now: START });
		const kv = createKv({});
		await kv.set(presenceKey(PEER), String(START), PRESENCE_TTL_MS);
		const at = (ms) => onlineAmong(kv, [PEER], { now: START + ms });
		assert.equal((await at(89_000)).has(PEER), true);
		assert.equal((await at(91_000)).has(PEER), false);
		kv.close();
	});

	it('250 ids are three MGETs, not 250 reads', async (t) => {
		const server = await respServer(storeHandler());
		const kv = createKv({ redisUrl: server.url });
		t.after(async () => { kv.close(); await server.close(); });
		await kv.ready({ timeoutMs: 1_000 });
		const ids = Array.from({ length: 250 }, (_, index) => `user-${index}`);
		await kv.set(presenceKey(ids[0]), String(START), PRESENCE_TTL_MS);
		const online = await onlineAmong(kv, ids, { now: START });
		const mgets = server.commands.filter((command) => command[0] === 'MGET');
		assert.equal(mgets.length, 3);
		assert.deepEqual(mgets.map((command) => command.length - 1), [100, 100, 50]);
		assert.equal(online.has(ids[0]), true);
		assert.equal(online.size, 1);
	});

	it('a store that is down answers an empty set and says so once', async (t) => {
		// A healthy read first: the warning belongs to the state change, not to the call.
		await onlineAmong({ getMany: async () => [null] }, [USER]);
		const warnings = [];
		t.mock.method(console, 'warn', (message) => warnings.push(message));
		const kv = brokenKv();
		assert.equal((await onlineAmong(kv, [USER])).size, 0);
		assert.equal((await onlineAmong(kv, [USER])).size, 0);
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /presence read skipped/);
	});
});

describe('recordHeartbeat', () => {
	it('releases the ten-minute window when the database write fails', async (t) => {
		t.mock.timers.enable({ apis: ['Date'], now: START });
		const kv = createKv({});
		const failing = async () => { throw new Error('BaaS down'); };
		t.mock.method(console, 'warn', () => {});
		const first = await recordHeartbeat(kv, { userId: USER, config: CONFIG, fetchImpl: failing, now: Date.now() });
		assert.equal(first.written, false);
		assert.equal(await kv.get(`presence-pg:${USER}`), null);
		kv.close();
	});
});

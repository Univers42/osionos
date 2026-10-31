/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-machines.test.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A paired machine after pairing (own-machines-plan.md, API contract and devil verdict
// 2026-10-31): the heartbeat and its rotation reply, the list, the default, the removal, the
// identity check and the token mint. A second account is refused on each one (condition 1).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { bridgeKeyFromSeed, nextKeyMessage, verifyMachineToken } from '../../scripts/machine-protocol.mjs';
import { fromB64url, verifyMessage } from '../../scripts/ide-agent-frames.mjs';
import { createBridgeServer } from '../../scripts/bridge-api.mjs';
import { createPg } from '../../scripts/bridge-pg.mjs';
import { accountConfig } from './support/account-world.mjs';
import { createTtlKv } from './support/account-kv.mjs';
import {
	IDE_ORIGIN, ORIGIN, SEED, USER_A, USER_B, call, createMachineStore, machineEnv, onlineMachine, pairThrough, routedFetch, startMachineWorld,
} from './support/machines-world.mjs';

const CURRENT = bridgeKeyFromSeed(SEED);
const NONCE = 'n0nce-n0nce-n0nce-n0nce';
const NEXT_SEED = Buffer.alloc(32, 7).toString('base64url');

describe('POST /api/machines/heartbeat', () => {
	it('records presence and answers the current key', async (t) => {
		const world = await startMachineWorld(t);
		const { id, machine } = await pairThrough(world);
		const answer = await call(world.base, '/api/machines/heartbeat', { body: machine.heartbeatBody(id, world.clock.at + 1) });
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { bridgeKeys: [{ kid: CURRENT.kid, publicKey: CURRENT.publicKey }] });
		assert.equal(answer.headers.get('access-control-allow-credentials'), null);
		assert.equal(JSON.parse(await world.kv.get(`machine-presence:${id}`)).ideOrigin, IDE_ORIGIN);
	});

	it('refuses a replayed or older ts with 400 stale (condition 6)', async (t) => {
		const world = await startMachineWorld(t);
		const { id, machine } = await onlineMachine(world);
		const replay = await call(world.base, '/api/machines/heartbeat', { body: machine.heartbeatBody(id, world.clock.at) });
		assert.equal(replay.status, 400);
		assert.equal(replay.body.code, 'stale');
		const older = await call(world.base, '/api/machines/heartbeat', { body: machine.heartbeatBody(id, world.clock.at - 5) });
		assert.equal(older.body.code, 'stale');
	});

	it('refuses a ts more than 60 s off with 400 stale', async (t) => {
		const world = await startMachineWorld(t);
		const { id, machine } = await pairThrough(world);
		const answer = await call(world.base, '/api/machines/heartbeat', { body: machine.heartbeatBody(id, world.clock.at + 61_000) });
		assert.equal(answer.status, 400);
		assert.equal(answer.body.code, 'stale');
	});

	it('refuses a non-loopback ideOrigin with 400 (condition 6)', async (t) => {
		const world = await startMachineWorld(t);
		const { id, machine } = await pairThrough(world);
		for (const origin of ['http://192.168.1.4:4100', 'https://127.0.0.1:4100', 'http://127.0.0.1:80', 'http://127.0.0.1:4100/x', 'http://localhost:4100']) {
			const answer = await call(world.base, '/api/machines/heartbeat', { body: machine.heartbeatBody(id, world.clock.at + 1, origin) });
			assert.equal(answer.status, 400, origin);
			assert.equal(answer.body.code, 'bad_request');
		}
	});

	it('refuses a signature by another key with 401', async (t) => {
		const world = await startMachineWorld(t);
		const { id } = await pairThrough(world);
		const other = await pairThrough(world);
		const answer = await call(world.base, '/api/machines/heartbeat', { body: other.machine.heartbeatBody(id, world.clock.at + 1) });
		assert.equal(answer.status, 401);
		assert.equal(answer.body.code, 'bad_signature');
	});

	it('answers a revoked machine exactly like an unknown one: 410 gone (condition 6)', async (t) => {
		const world = await startMachineWorld(t);
		const { id, machine, token } = await onlineMachine(world);
		assert.equal((await call(world.base, `/api/machines/${id}`, { method: 'DELETE', token })).status, 204);
		const revoked = await call(world.base, '/api/machines/heartbeat', { body: machine.heartbeatBody(id, world.clock.at + 1) });
		const unknown = await call(world.base, '/api/machines/heartbeat', { body: machine.heartbeatBody('m-aaaaaaaaaaaaaaaa', world.clock.at + 1) });
		assert.equal(revoked.status, 410);
		assert.deepEqual(revoked.body, unknown.body);
		assert.equal(revoked.body.code, 'gone');
	});

	it('hands the next key signed by the current one, so a machine rotates without re-pairing (condition 3)', async (t) => {
		const world = await startMachineWorld(t, { env: machineEnv({ OSIONOS_MACHINE_SIGNING_KEY_NEXT: NEXT_SEED }) });
		const { id, machine } = await pairThrough(world);
		const answer = await call(world.base, '/api/machines/heartbeat', { body: machine.heartbeatBody(id, world.clock.at + 1) });
		const next = bridgeKeyFromSeed(NEXT_SEED);
		const [current, offered] = answer.body.bridgeKeys;
		assert.deepEqual(current, { kid: CURRENT.kid, publicKey: CURRENT.publicKey });
		assert.equal(offered.kid, next.kid);
		assert.equal(offered.publicKey, next.publicKey);
		assert.ok(verifyMessage(fromB64url(CURRENT.publicKey), nextKeyMessage({ origin: ORIGIN, kid: next.kid, publicKey: next.publicKey }), offered.sig));
	});
});

describe('GET /api/machines and PUT /api/machines/:id/default', () => {
	it('lists only my machines, with presence, and an offline one has a null ideOrigin', async (t) => {
		const world = await startMachineWorld(t);
		const online = await onlineMachine(world);
		const offline = await pairThrough(world);
		await pairThrough(world, { user: USER_B });
		const answer = await call(world.base, '/api/machines', { method: 'GET', token: world.plain() });
		assert.equal(answer.status, 200);
		const byId = Object.fromEntries(answer.body.machines.map((row) => [row.id, row]));
		assert.deepEqual(Object.keys(byId).sort(), [online.id, offline.id].sort());
		assert.equal(byId[online.id].online, true);
		assert.equal(byId[online.id].ideOrigin, IDE_ORIGIN);
		assert.equal(byId[offline.id].online, false);
		assert.equal(byId[offline.id].ideOrigin, null);
		assert.equal(byId[offline.id].lastSeenAt, null);
		assert.deepEqual(Object.keys(byId[online.id]).sort(), ['fingerprint', 'id', 'ideOrigin', 'isDefault', 'lastSeenAt', 'name', 'online', 'platform']);
	});

	it('a second account cannot list the owner machine (condition 1)', async (t) => {
		const world = await startMachineWorld(t);
		await onlineMachine(world);
		const answer = await call(world.base, '/api/machines', { method: 'GET', token: world.plain(USER_B) });
		assert.deepEqual(answer.body, { machines: [] });
	});

	it('needs a session: 401', async (t) => {
		const world = await startMachineWorld(t);
		assert.equal((await call(world.base, '/api/machines', { method: 'GET' })).status, 401);
	});

	it('moves the default to one machine (204) and answers 404 for a machine not mine', async (t) => {
		const world = await startMachineWorld(t);
		const first = await pairThrough(world);
		const second = await pairThrough(world);
		assert.equal((await call(world.base, `/api/machines/${first.id}/default`, { method: 'PUT', token: world.plain() })).status, 204);
		assert.equal((await call(world.base, `/api/machines/${second.id}/default`, { method: 'PUT', token: world.plain() })).status, 204);
		const defaults = world.store.rows().filter((row) => row.is_default).map((row) => row.id);
		assert.deepEqual(defaults, [second.id]);
		const foreign = await call(world.base, `/api/machines/${second.id}/default`, { method: 'PUT', token: world.plain(USER_B) });
		assert.equal(foreign.status, 404);
	});
});

describe('DELETE /api/machines/:id', () => {
	it('revokes the row and drops the presence (204)', async (t) => {
		const world = await startMachineWorld(t);
		const { id, token } = await onlineMachine(world);
		assert.equal((await call(world.base, `/api/machines/${id}`, { method: 'DELETE', token })).status, 204);
		assert.ok(world.store.rows()[0].revoked_at);
		assert.equal(await world.kv.get(`machine-presence:${id}`), null);
		assert.deepEqual((await call(world.base, '/api/machines', { method: 'GET', token: world.plain() })).body, { machines: [] });
	});

	it('needs a step-up (403) and answers 404 to a second account (condition 1)', async (t) => {
		const world = await startMachineWorld(t);
		const { id } = await pairThrough(world);
		assert.equal((await call(world.base, `/api/machines/${id}`, { method: 'DELETE', token: world.plain() })).status, 403);
		assert.equal((await call(world.base, `/api/machines/${id}`, { method: 'DELETE', token: await world.sudo(USER_B) })).status, 404);
		assert.equal(world.store.rows()[0].revoked_at, null);
	});
});

describe('POST /api/machines/:id/identity', () => {
	it('accepts the whoami signed by the row key over the presence ideOrigin', async (t) => {
		const world = await startMachineWorld(t);
		const { id, machine } = await onlineMachine(world);
		const answer = await call(world.base, `/api/machines/${id}/identity`, { token: world.plain(), body: machine.whoamiBody(id, NONCE) });
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { ok: true });
	});

	it('refuses another machine answering on the same port with 422 identity_mismatch (condition 5)', async (t) => {
		const world = await startMachineWorld(t);
		const owner = await onlineMachine(world);
		const impostor = await onlineMachine(world);
		const answer = await call(world.base, `/api/machines/${owner.id}/identity`, { token: world.plain(), body: impostor.machine.whoamiBody(owner.id, NONCE) });
		assert.equal(answer.status, 422);
		assert.equal(answer.body.code, 'identity_mismatch');
		const otherOrigin = await call(world.base, `/api/machines/${owner.id}/identity`, { token: world.plain(), body: owner.machine.whoamiBody(owner.id, NONCE, 'http://127.0.0.1:4200') });
		assert.equal(otherOrigin.body.code, 'identity_mismatch');
	});

	it('answers 409 offline without presence, and 404 to a second account (condition 1)', async (t) => {
		const world = await startMachineWorld(t);
		const { id, machine } = await pairThrough(world);
		const offline = await call(world.base, `/api/machines/${id}/identity`, { token: world.plain(), body: machine.whoamiBody(id, NONCE) });
		assert.equal(offline.status, 409);
		assert.equal(offline.body.code, 'offline');
		const foreign = await call(world.base, `/api/machines/${id}/identity`, { token: world.plain(USER_B), body: machine.whoamiBody(id, NONCE) });
		assert.equal(foreign.status, 404);
	});
});

describe('POST /api/machines/:id/token', () => {
	it('mints a token the machine verifies, with aud = the presence ideOrigin', async (t) => {
		const world = await startMachineWorld(t);
		const { id, token } = await onlineMachine(world);
		const answer = await call(world.base, `/api/machines/${id}/token`, { token });
		assert.equal(answer.status, 200);
		const claims = verifyMachineToken(answer.body.token, { keys: { [CURRENT.kid]: CURRENT.publicKey }, machine: id, aud: IDE_ORIGIN, now: world.clock.at });
		assert.equal(claims.sub, USER_A);
		assert.equal(answer.body.exp, claims.exp);
	});

	it('needs a step-up: 403 sudo_required', async (t) => {
		const world = await startMachineWorld(t);
		const { id } = await onlineMachine(world);
		const answer = await call(world.base, `/api/machines/${id}/token`, { token: world.plain() });
		assert.equal(answer.status, 403);
		assert.equal(answer.body.code, 'sudo_required');
	});

	it('a second account gets 403 not_allowed (condition 1)', async (t) => {
		const world = await startMachineWorld(t);
		const { id } = await onlineMachine(world);
		const answer = await call(world.base, `/api/machines/${id}/token`, { token: await world.sudo(USER_B) });
		assert.equal(answer.status, 403);
		assert.equal(answer.body.code, 'not_allowed');
	});

	it('reads revoked_at from Postgres, not the presence: a revoked row is refused while still online (condition 7)', async (t) => {
		const world = await startMachineWorld(t);
		const { id, token } = await onlineMachine(world);
		world.store.rows()[0].revoked_at = new Date(world.clock.at).toISOString();
		const answer = await call(world.base, `/api/machines/${id}/token`, { token });
		assert.equal(answer.status, 403);
		assert.equal(answer.body.code, 'not_allowed');
	});

	it('answers 404 for an unknown id and 409 offline without presence', async (t) => {
		const world = await startMachineWorld(t);
		const { id, token } = await pairThrough(world);
		assert.equal((await call(world.base, '/api/machines/m-aaaaaaaaaaaaaaaa/token', { token })).status, 404);
		const offline = await call(world.base, `/api/machines/${id}/token`, { token });
		assert.equal(offline.status, 409);
		assert.equal(offline.body.code, 'offline');
	});
});

describe('the signing key and the mount', () => {
	for (const [label, env] of [['missing', machineEnv({ OSIONOS_MACHINE_SIGNING_KEY: '' })], ['not 32 bytes', machineEnv({ OSIONOS_MACHINE_SIGNING_KEY: 'c2hvcnQ' })], ['a bad next key', machineEnv({ OSIONOS_MACHINE_SIGNING_KEY_NEXT: 'x' })], ['no public origin', machineEnv({ OSIONOS_BRIDGE_PUBLIC_ORIGIN: '' })]]) {
		it(`answers 503 machines_unavailable on every route with ${label}`, async (t) => {
			const world = await startMachineWorld(t, { env });
			for (const [method, path] of [['POST', '/api/machines/pair/start'], ['POST', '/api/machines/heartbeat'], ['GET', '/api/machines'], ['POST', '/api/machines/m-aaaaaaaaaaaaaaaa/token']]) {
				const answer = await call(world.base, path, { method, token: world.plain(), body: method === 'POST' ? {} : undefined });
				assert.equal(answer.status, 503, `${method} ${path}`);
				assert.equal(answer.body.code, 'machines_unavailable');
			}
		});
	}

	it('the whole bridge routes /api/machines to the module, with the app CORS on session routes', async (t) => {
		const config = accountConfig();
		const store = createMachineStore();
		const env = machineEnv();
		const fetchImpl = routedFetch(store);
		const server = createBridgeServer({ config, fetchImpl, pg: createPg({ config, env, fetchImpl }), kv: createTtlKv(), env, moderationRetract: false });
		await new Promise((done) => server.listen(0, '127.0.0.1', done));
		t.after(() => new Promise((done) => server.close(done)));
		const base = `http://127.0.0.1:${server.address().port}`;
		const unauthenticated = await call(base, '/api/machines', { method: 'GET', headers: { origin: 'app://osionos' } });
		assert.equal(unauthenticated.status, 401);
		assert.equal(unauthenticated.headers.get('access-control-allow-origin'), 'app://osionos');
		const started = await call(base, '/api/machines/pair/start', { body: { pubkey: 'x' }, headers: { origin: 'app://osionos' } });
		assert.equal(started.status, 400);
		assert.equal(started.body.code, 'bad_request');
		assert.equal(started.headers.get('access-control-allow-origin'), null);
		assert.equal(started.headers.get('access-control-allow-credentials'), null);
	});
});

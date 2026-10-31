/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-machines-pairing.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The device-code pairing of an own machine (own-machines-plan.md, API contract and devil
// verdict 2026-10-31, condition 4): start, claim, approve, decline and poll. Each refusal the
// contract lists has its own test, and each devil condition is named in a test title.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { accountConfig } from './support/account-world.mjs';
import { createMachinePairing } from '../../scripts/bridge-machines-pairing.mjs';
import { bridgeKeyFromSeed, nextKeyMessage } from '../../scripts/ide-machine-protocol.mjs';
import { fromB64url, verifyMessage } from '../../scripts/ide-agent-frames.mjs';
import { EMAILS, ORIGIN, SEED, USER_A, USER_B, call, fakeMachine, machineEnv, pairThrough, startMachineWorld } from './support/machines-world.mjs';

const CURRENT = bridgeKeyFromSeed(SEED);

describe('POST /api/machines/pair/start', () => {
	it('answers a pair id and a code from the relay alphabet, valid 300 s', async (t) => {
		const world = await startMachineWorld(t);
		const answer = await call(world.base, '/api/machines/pair/start', { body: fakeMachine().startBody(world.clock.at) });
		assert.equal(answer.status, 200);
		assert.match(answer.body.code, /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
		assert.equal(typeof answer.body.pairId, 'string');
		assert.equal(answer.body.expiresIn, 300);
		assert.equal(answer.body.interval, 5);
	});

	it('sends no credentialed CORS header: the node calls it server to server', async (t) => {
		const world = await startMachineWorld(t);
		const answer = await call(world.base, '/api/machines/pair/start', { body: fakeMachine().startBody(world.clock.at), headers: { origin: 'https://evil.test' } });
		assert.equal(answer.headers.get('access-control-allow-credentials'), null);
		assert.equal(answer.headers.get('access-control-allow-origin'), null);
	});

	it('refuses a malformed body with 400 bad_request', async (t) => {
		const world = await startMachineWorld(t);
		const machine = fakeMachine();
		for (const over of [{ pubkey: 'short' }, { name: '' }, { name: 'x'.repeat(65) }, { platform: 'linux x64; rm' }, { platform: 'linux' }, { platform: 'freebsd-x64' }, { ts: 'now' }, { sig: 7 }]) {
			const answer = await call(world.base, '/api/machines/pair/start', { body: machine.startBody(world.clock.at, over) });
			assert.equal(answer.status, 400, JSON.stringify(over));
			assert.equal(answer.body.code, 'bad_request');
		}
	});

	it('refuses a ts outside ±60 s with 400 bad_request', async (t) => {
		const world = await startMachineWorld(t);
		const answer = await call(world.base, '/api/machines/pair/start', { body: fakeMachine().startBody(world.clock.at - 61_000) });
		assert.equal(answer.status, 400);
		assert.equal(answer.body.code, 'bad_request');
	});

	it('refuses a signature by another key with 401 bad_signature', async (t) => {
		const world = await startMachineWorld(t);
		const other = fakeMachine();
		const body = { ...fakeMachine().startBody(world.clock.at), sig: other.startBody(world.clock.at).sig };
		const answer = await call(world.base, '/api/machines/pair/start', { body });
		assert.equal(answer.status, 401);
		assert.equal(answer.body.code, 'bad_signature');
	});

	it('limits the starts of one client address with 429 rate_limited', async (t) => {
		const world = await startMachineWorld(t);
		const statuses = [];
		for (let attempt = 0; attempt < 6; attempt += 1) {
			statuses.push((await call(world.base, '/api/machines/pair/start', { body: fakeMachine().startBody(world.clock.at) })).status);
		}
		assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
	});

	it('limits the starts globally across client addresses with 429 rate_limited (condition 9)', async (t) => {
		const world = await startMachineWorld(t, { config: { ...accountConfig(), clientIpHeader: 'x-forwarded-for' } });
		const statuses = [];
		for (let attempt = 0; attempt < 21; attempt += 1) {
			const ip = `10.0.${attempt}.1`;
			statuses.push((await call(world.base, '/api/machines/pair/start', { body: fakeMachine().startBody(world.clock.at), headers: { 'x-forwarded-for': ip } })).status);
		}
		assert.equal(statuses.filter((status) => status === 200).length, 20);
		assert.equal(statuses.at(-1), 429);
	});
});

describe('POST /api/machines/pair/claim', () => {
	it('answers the machine name, platform and fingerprint for the fingerprint check', async (t) => {
		const world = await startMachineWorld(t);
		const machine = fakeMachine();
		const started = await call(world.base, '/api/machines/pair/start', { body: machine.startBody(world.clock.at) });
		const answer = await call(world.base, '/api/machines/pair/claim', { token: await world.sudo(), body: { code: started.body.code.toLowerCase() } });
		assert.equal(answer.status, 200);
		assert.equal(answer.body.pairId, started.body.pairId);
		assert.equal(answer.body.name, 'laptop');
		assert.equal(answer.body.platform, 'linux-x64');
		assert.match(answer.body.fingerprint, /^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);
		assert.ok(Object.hasOwn(answer.body, 'startIp') && Object.hasOwn(answer.body, 'yourIp'));
	});

	it('needs a session (401) and a step-up (403 sudo_required)', async (t) => {
		const world = await startMachineWorld(t);
		assert.equal((await call(world.base, '/api/machines/pair/claim', { body: { code: 'BCDF-GHJK' } })).status, 401);
		const noSudo = await call(world.base, '/api/machines/pair/claim', { token: world.plain(), body: { code: 'BCDF-GHJK' } });
		assert.equal(noSudo.status, 403);
		assert.equal(noSudo.body.code, 'sudo_required');
	});

	it('consumes the code on the first claim: a reused code is 404 like an unknown one (condition 4)', async (t) => {
		const world = await startMachineWorld(t);
		const started = await call(world.base, '/api/machines/pair/start', { body: fakeMachine().startBody(world.clock.at) });
		assert.equal((await call(world.base, '/api/machines/pair/claim', { token: await world.sudo(), body: { code: started.body.code } })).status, 200);
		const reused = await call(world.base, '/api/machines/pair/claim', { token: await world.sudo(USER_B), body: { code: started.body.code } });
		const unknown = await call(world.base, '/api/machines/pair/claim', { token: await world.sudo(USER_B), body: { code: 'BCDF-GHJK' } });
		assert.equal(reused.status, 404);
		assert.deepEqual(reused.body, unknown.body);
		assert.equal(reused.body.code, 'not_found');
	});

	it('treats an expired code like an unknown one', async (t) => {
		const world = await startMachineWorld(t);
		const started = await call(world.base, '/api/machines/pair/start', { body: fakeMachine().startBody(world.clock.at) });
		world.clock.at += 301_000;
		const answer = await call(world.base, '/api/machines/pair/claim', { token: await world.sudo(), body: { code: started.body.code } });
		assert.equal(answer.status, 404);
		assert.equal(answer.body.code, 'not_found');
	});

	it('caps the failed claims of one user, and refuses before it looks (condition 4)', async (t) => {
		const world = await startMachineWorld(t);
		const token = await world.sudo();
		for (let attempt = 0; attempt < 5; attempt += 1) {
			assert.equal((await call(world.base, '/api/machines/pair/claim', { token, body: { code: 'BCDF-GHJK' } })).status, 404);
		}
		const started = await call(world.base, '/api/machines/pair/start', { body: fakeMachine().startBody(world.clock.at) });
		const good = await call(world.base, '/api/machines/pair/claim', { token, body: { code: started.body.code } });
		assert.equal(good.status, 429);
		assert.equal(good.body.code, 'rate_limited');
	});

	it('caps the failed claims globally, so many accounts cannot brute-force together (condition 4)', async (t) => {
		const world = await startMachineWorld(t);
		const users = Array.from({ length: 101 }, (_, index) => `cccccccc-3333-4333-8333-${String(index).padStart(12, '0')}`);
		for (const user of users.slice(0, 100)) {
			const token = await world.sudo(user);
			for (let attempt = 0; attempt < 5; attempt += 1) await call(world.base, '/api/machines/pair/claim', { token, body: { code: 'BCDF-GHJK' } });
		}
		const fresh = await call(world.base, '/api/machines/pair/claim', { token: await world.sudo(users[10]), body: { code: 'BCDF-GHJK' } });
		assert.equal(fresh.status, 429);
		assert.equal(fresh.body.code, 'rate_limited');
	});
});

describe('POST /api/machines/pair/approve', () => {
	it('writes a row that is never the default (condition 4) and answers 201 {id}', async (t) => {
		const world = await startMachineWorld(t);
		const { approved, machine } = await pairThrough(world);
		assert.equal(approved.status, 201);
		assert.match(approved.body.id, /^m-[a-z2-7]{16}$/);
		const [row] = world.store.rows();
		assert.equal(row.id, approved.body.id);
		assert.equal(row.user_id, USER_A);
		assert.equal(row.is_default, false);
		assert.equal(row.pubkey, machine.pubkey);
		assert.ok(world.store.rows('osionos_bridge_audit_events').some((audit) => audit.event_type === 'machine.paired'));
	});

	it('answers 404 to anyone but the claimer', async (t) => {
		const world = await startMachineWorld(t);
		const started = await call(world.base, '/api/machines/pair/start', { body: fakeMachine().startBody(world.clock.at) });
		const claimed = await call(world.base, '/api/machines/pair/claim', { token: await world.sudo(), body: { code: started.body.code } });
		const other = await call(world.base, '/api/machines/pair/approve', { token: await world.sudo(USER_B), body: { pairId: claimed.body.pairId } });
		assert.equal(other.status, 404);
		assert.equal(world.store.rows().length, 0);
	});

	it('needs a step-up', async (t) => {
		const world = await startMachineWorld(t);
		const answer = await call(world.base, '/api/machines/pair/approve', { token: world.plain(), body: { pairId: 'x' } });
		assert.equal(answer.status, 403);
	});

	it('caps a user at 5 machines with 409 machine_cap', async (t) => {
		const world = await startMachineWorld(t);
		for (let index = 0; index < 5; index += 1) assert.equal((await pairThrough(world)).approved.status, 201);
		world.clock.at += 600_001;
		const sixth = await pairThrough(world);
		assert.equal(sixth.approved.status, 409);
		assert.equal(sixth.approved.body.code, 'machine_cap');
		assert.equal(world.store.rows().length, 5);
	});

	it('holds the cap when two approves of one user race: one 201, one 409', async (t) => {
		const world = await startMachineWorld(t, { latencyMs: 5 });
		for (let index = 0; index < 4; index += 1) assert.equal((await pairThrough(world)).approved.status, 201);
		world.clock.at += 600_001;
		const token = await world.sudo();
		const claimed = [];
		for (let index = 0; index < 2; index += 1) {
			const started = await call(world.base, '/api/machines/pair/start', { body: fakeMachine().startBody(world.clock.at) });
			claimed.push((await call(world.base, '/api/machines/pair/claim', { token, body: { code: started.body.code } })).body.pairId);
		}
		const answers = await Promise.all(claimed.map((pairId) => call(world.base, '/api/machines/pair/approve', { token, body: { pairId } })));
		assert.deepEqual(answers.map((answer) => answer.status).sort(), [201, 409]);
		assert.equal(world.store.rows().length, 5);
	});
});

describe('POST /api/machines/pair/decline and /poll', () => {
	it('polls pending (202), then answers the account email once (200), then 404', async (t) => {
		const world = await startMachineWorld(t);
		const machine = fakeMachine();
		const started = await call(world.base, '/api/machines/pair/start', { body: machine.startBody(world.clock.at) });
		const pending = await call(world.base, '/api/machines/pair/poll', { body: machine.pollBody(started.body.pairId, world.clock.at) });
		assert.equal(pending.status, 202);
		assert.deepEqual(pending.body, { status: 'pending' });
		const token = await world.sudo();
		await call(world.base, '/api/machines/pair/claim', { token, body: { code: started.body.code } });
		const approved = await call(world.base, '/api/machines/pair/approve', { token, body: { pairId: started.body.pairId } });
		const done = await call(world.base, '/api/machines/pair/poll', { body: machine.pollBody(started.body.pairId, world.clock.at + 1) });
		assert.equal(done.status, 200);
		assert.deepEqual(done.body, { machineId: approved.body.id, ownerId: USER_A, accountEmail: EMAILS[USER_A], bridgeKeys: [{ kid: CURRENT.kid, publicKey: CURRENT.publicKey }] });
		const again = await call(world.base, '/api/machines/pair/poll', { body: machine.pollBody(started.body.pairId, world.clock.at + 2) });
		assert.equal(again.status, 404);
		assert.equal(again.body.code, 'not_found');
	});

	it('refuses a poll signed by another key with 401', async (t) => {
		const world = await startMachineWorld(t);
		const started = await call(world.base, '/api/machines/pair/start', { body: fakeMachine().startBody(world.clock.at) });
		const answer = await call(world.base, '/api/machines/pair/poll', { body: fakeMachine().pollBody(started.body.pairId, world.clock.at) });
		assert.equal(answer.status, 401);
		assert.equal(answer.body.code, 'bad_signature');
	});

	it('answers 404 to a poll of an unknown pair id', async (t) => {
		const world = await startMachineWorld(t);
		const answer = await call(world.base, '/api/machines/pair/poll', { body: fakeMachine().pollBody('nope', world.clock.at) });
		assert.equal(answer.status, 404);
	});

	it('declines for the claimer only (204), and the node then reads 410 declined', async (t) => {
		const world = await startMachineWorld(t);
		const machine = fakeMachine();
		const started = await call(world.base, '/api/machines/pair/start', { body: machine.startBody(world.clock.at) });
		await call(world.base, '/api/machines/pair/claim', { token: await world.sudo(), body: { code: started.body.code } });
		assert.equal((await call(world.base, '/api/machines/pair/decline', { token: world.plain(USER_B), body: { pairId: started.body.pairId } })).status, 404);
		assert.equal((await call(world.base, '/api/machines/pair/decline', { token: world.plain(), body: { pairId: started.body.pairId } })).status, 204);
		const polled = await call(world.base, '/api/machines/pair/poll', { body: machine.pollBody(started.body.pairId, world.clock.at) });
		assert.equal(polled.status, 410);
		assert.equal(polled.body.code, 'declined');
	});

	it('refuses to decline an entry whose approve is in flight', async (t) => {
		const pairing = createMachinePairing({ now: () => Date.UTC(2026, 9, 31, 12) });
		const machine = fakeMachine();
		const { code, pairId } = pairing.start(machine.startBody(Date.UTC(2026, 9, 31, 12)), { origin: ORIGIN, clientKey: 'c', startIp: '10.0.0.0/24' });
		pairing.claim(USER_A, code);
		pairing.reserve(USER_A, pairId);
		assert.throws(() => pairing.decline(USER_A, pairId), { status: 404 });
	});

	it('hands the next key at pairing too, signed by the current one', async (t) => {
		const next = randomSeed();
		const world = await startMachineWorld(t, { env: machineEnv({ OSIONOS_MACHINE_SIGNING_KEY_NEXT: next }) });
		const machine = fakeMachine();
		const started = await call(world.base, '/api/machines/pair/start', { body: machine.startBody(world.clock.at) });
		const token = await world.sudo();
		await call(world.base, '/api/machines/pair/claim', { token, body: { code: started.body.code } });
		await call(world.base, '/api/machines/pair/approve', { token, body: { pairId: started.body.pairId } });
		const done = await call(world.base, '/api/machines/pair/poll', { body: machine.pollBody(started.body.pairId, world.clock.at) });
		const offered = done.body.bridgeKeys[1];
		assert.equal(offered.kid, bridgeKeyFromSeed(next).kid);
		assert.ok(verifyMessage(fromB64url(CURRENT.publicKey), nextKeyMessage({ origin: ORIGIN, kid: offered.kid, publicKey: offered.publicKey }), offered.sig));
	});
});

function randomSeed() {
	return Buffer.from(Array.from({ length: 32 }, (_, index) => (index * 37 + 11) % 256)).toString('base64url');
}

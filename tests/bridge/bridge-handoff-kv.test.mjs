/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-handoff-kv.test.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The handoff and the replay markers live in the shared store, so two replicas agree on
 * them: a handoff minted on one is consumed on the other, and a replayed gateway assertion
 * is refused on the other. The stored record is sealed: the store holds neither the token
 * nor a usable session.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { consumeHandoffToken, createBridgeHandoff } from '../../scripts/bridge-api.mjs';
import { handoffLookupKey, handoffSealKey } from '../../scripts/bridge-shared-store.mjs';
import { createKv } from '../../scripts/bridge-kv.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { noFactorPg } from './support/no-factor-pg.mjs';

import { APP_SECRET, USER_A, gatewayRequest, postJson, sessionConfig, startSessionBridge } from './support/session-world.mjs';

const SKEW_MS = 5 * 60 * 1000;

function payloadFor(subject = USER_A) {
	return { provider: 'prismatica', subject, email: 'member@example.com', name: 'Member', jti: randomUUID() };
}

function tokenOf(redirectUrl) {
	return new URL(redirectUrl).hash.replace('#bridge_token=', '');
}

describe('the handoff is shared by every replica', () => {
	it('is consumed on the second replica and refused on the first', async (t) => {
		const kv = createKv({});
		t.after(() => kv.close());
		const a = await startSessionBridge({ t, kv, config: sessionConfig() });
		const b = await startSessionBridge({ t, kv, config: sessionConfig() });
		const request = gatewayRequest(payloadFor(), { timestamp: Date.now() });
		const minted = await postJson(a.base, '/api/auth/bridge/session', { headers: request.headers, body: JSON.parse(request.body) });
		assert.equal(minted.status, 200);
		const token = tokenOf(minted.body.redirectUrl);
		const onB = await postJson(b.base, '/api/auth/bridge/consume', { body: { token } });
		assert.equal(onB.status, 200);
		assert.ok(onB.body.session.accessToken);
		const onA = await postJson(a.base, '/api/auth/bridge/consume', { body: { token } });
		assert.equal(onA.status, 404);
	});

	it('refuses a gateway assertion that another replica already accepted', async (t) => {
		const kv = createKv({});
		t.after(() => kv.close());
		const a = await startSessionBridge({ t, kv, config: sessionConfig() });
		const b = await startSessionBridge({ t, kv, config: sessionConfig() });
		const request = gatewayRequest(payloadFor(), { timestamp: Date.now() });
		const first = await postJson(a.base, '/api/auth/bridge/session', { headers: request.headers, body: JSON.parse(request.body) });
		assert.equal(first.status, 200);
		const replay = await postJson(b.base, '/api/auth/bridge/session', { headers: request.headers, body: JSON.parse(request.body) });
		assert.equal(replay.status, 409);
	});

	it('does not burn a jti whose signature was wrong', async (t) => {
		const kv = createKv({});
		t.after(() => kv.close());
		const { base } = await startSessionBridge({ t, kv, config: sessionConfig() });
		const payload = payloadFor();
		const bad = gatewayRequest(payload, { timestamp: Date.now(), badSignature: true });
		const refused = await postJson(base, '/api/auth/bridge/session', { headers: bad.headers, body: JSON.parse(bad.body) });
		assert.equal(refused.status, 401);
		const good = gatewayRequest(payload, { timestamp: Date.now() });
		const accepted = await postJson(base, '/api/auth/bridge/session', { headers: good.headers, body: JSON.parse(good.body) });
		assert.equal(accepted.status, 200, 'the jti was not burned by the bad signature');
	});

	it('keeps the replay marker for two skew windows', async (t) => {
		t.mock.timers.enable({ apis: ['Date'] });
		const kv = createKv({});
		t.after(() => kv.close());
		const { base } = await startSessionBridge({ t, kv, config: sessionConfig() });
		const payload = payloadFor();
		const timestamp = Date.now() + SKEW_MS;
		const request = gatewayRequest(payload, { timestamp });
		const accepted = await postJson(base, '/api/auth/bridge/session', { headers: request.headers, body: JSON.parse(request.body) });
		assert.equal(accepted.status, 200, 'a timestamp one skew in the future is accepted');
		t.mock.timers.tick(SKEW_MS / 2);
		const replay = await postJson(base, '/api/auth/bridge/session', { headers: request.headers, body: JSON.parse(request.body) });
		assert.equal(replay.status, 409, 'the marker is still there half a skew window later');
	});
});

describe('the stored handoff is sealed', () => {
	it('holds neither the token nor a usable session', async () => {
		const kv = kvStub();
		const config = sessionConfig({ persistence: 'memory' });
		const minted = await createBridgeHandoff({ payload: payloadFor(), config, pg: noFactorPg(), kv, now: Date.now(), fetchImpl: async () => new Response('[]') });
		const token = tokenOf(minted.redirectUrl);
		const key = handoffLookupKey(token);
		const stored = kv.values.get(`osb:${key}`);
		assert.ok(stored, 'the record is in the store');
		assert.notEqual(stored, minted.redirectUrl);
		const raw = Buffer.from(stored, 'base64');
		for (const form of [stored, raw.toString('utf8'), raw.toString('hex')]) {
			assert.ok(!form.includes(token), 'the token is not in the stored value');
			assert.ok(!form.includes('member@example.com'), 'the persona email is not in the stored value');
		}
		const opened = await consumeHandoffToken(token, kv, Date.now(), APP_SECRET);
		assert.ok(opened.session.accessToken, 'the bridge can still open what it sealed');
	});

	it('looks the record up under a key that is not the seal key and holds no part of the token', async () => {
		const kv = kvStub();
		const config = sessionConfig({ persistence: 'memory' });
		const minted = await createBridgeHandoff({ payload: payloadFor(), config, pg: noFactorPg(), kv, now: Date.now(), fetchImpl: async () => new Response('[]') });
		const token = tokenOf(minted.redirectUrl);
		const key = handoffLookupKey(token);
		assert.notEqual(key, handoffSealKey(APP_SECRET).toString('hex'));
		assert.ok(!key.includes(token));
		assert.ok(!key.includes(Buffer.from(token).toString('hex')));
		assert.ok(!key.includes(Buffer.from(token).toString('base64')));
	});

	it('answers 404 for a record whose ciphertext was flipped', async () => {
		const kv = kvStub();
		const config = sessionConfig({ persistence: 'memory' });
		const minted = await createBridgeHandoff({ payload: payloadFor(), config, pg: noFactorPg(), kv, now: Date.now(), fetchImpl: async () => new Response('[]') });
		const token = tokenOf(minted.redirectUrl);
		const name = `osb:${handoffLookupKey(token)}`;
		const blob = Buffer.from(kv.values.get(name), 'base64');
		blob[20] ^= 0x01;
		kv.values.set(name, blob.toString('base64'));
		await assert.rejects(() => consumeHandoffToken(token, kv, Date.now(), APP_SECRET), (error) => error.status === 404);
	});

	it('answers 410 for an expired handoff and 404 for an unknown one', async () => {
		const kv = kvStub();
		const config = sessionConfig({ persistence: 'memory' });
		const minted = await createBridgeHandoff({ payload: payloadFor(), config, pg: noFactorPg(), kv, now: Date.now(), fetchImpl: async () => new Response('[]') });
		const token = tokenOf(minted.redirectUrl);
		await assert.rejects(
			() => consumeHandoffToken(token, kv, Date.now() + 91_000, APP_SECRET),
			(error) => error.status === 410 && /expired/.test(error.message),
		);
		await assert.rejects(
			() => consumeHandoffToken('never-minted', kv, Date.now(), APP_SECRET),
			(error) => error.status === 404,
		);
	});
});

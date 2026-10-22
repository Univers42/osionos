/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-sudo.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The step-up proof of the account plane: the code request, the code verify, the
 * grant and the state of the grant.
 *
 * Every refusal path has its own test. A step-up that fails open is a step-up that does
 * not exist, so the faults are named one by one: a proof signed with another secret, a
 * proof that claims another algorithm, another audience, another address, an expired
 * one, a missing one and a replayed one.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maskAddress } from '../../scripts/bridge-account-sudo.mjs';
import { createOtpService, otpProof } from './support/account-otp.mjs';
import { createTtlKv } from './support/account-kv.mjs';
import { ACCOUNT_JWT_SECRET, send, sessionToken, startAccountWorld, startBridgeWorld, USER_A, USER_B } from './support/account-world.mjs';

const ADDRESS = 'ada.lovelace@example.com';
const MASKED = 'a•••@e•••.com';
const CODE = '123456';

/** A world with the OTP service, a clock the test moves, and the caller's session. */
async function world(t, { otp, kv, env = { JWT_SECRET: ACCOUNT_JWT_SECRET }, rows = {}, fail = null } = {}) {
	const clock = { at: Date.now() };
	const store = kv ?? createTtlKv({ now: () => clock.at });
	const service = otp ?? createOtpService({ email: ADDRESS, secret: ACCOUNT_JWT_SECRET, now: () => clock.at });
	const built = await startAccountWorld(t, { rows, fail, otp: service, kv: store, env, now: () => clock.at });
	return { ...built, token: sessionToken(built.config, USER_A), clock, kv: store, otp: service };
}

/** The calls the fake saw, by path. */
const callsTo = (otp, path) => otp.calls.filter((call) => call.path === path);

describe('maskAddress', () => {
	it('keeps the first character of the local part and the last label of the domain', () => {
		assert.equal(maskAddress('dylan@gmail.com'), 'd•••@g•••.com');
		assert.equal(maskAddress('a@mail.example.com'), 'a•••@m•••.com');
	});

	it('copes with a one-character local part and an address with no dot after the @', () => {
		assert.equal(maskAddress('d@localhost'), 'd•••@l•••');
		assert.equal(maskAddress('not-an-address'), '•••');
	});
});

describe('POST /api/account/sudo/email', () => {
	it('sends a code to the address GoTrue holds and answers the masked form', async (t) => {
		const { base, token, otp } = await world(t);
		const response = await send(base, '/api/account/sudo/email', { method: 'POST', token });
		assert.equal(response.status, 202);
		assert.deepEqual(response.body, { method: 'email', sentTo: MASKED });
		const request = callsTo(otp, '/v1/auth/otp/request')[0];
		assert.equal(request.body.email, ADDRESS);
		assert.equal(request.headers.apikey, 'service-role-test-key');
	});

	it('never lets the body choose the address', async (t) => {
		const { base, token, otp } = await world(t);
		const response = await send(base, '/api/account/sudo/email', { method: 'POST', token, body: { email: 'attacker@evil.test' } });
		assert.equal(response.status, 202);
		assert.equal(response.body.sentTo, MASKED);
		assert.equal(callsTo(otp, '/v1/auth/otp/request')[0].body.email, ADDRESS);
	});

	it('answers 429 when the send limit of the window is over', async (t) => {
		const { base, token } = await world(t);
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const sent = await send(base, '/api/account/sudo/email', { method: 'POST', token });
			assert.equal(sent.status, 202, `send ${attempt + 1} answers ${sent.status}`);
		}
		const limited = await send(base, '/api/account/sudo/email', { method: 'POST', token });
		assert.equal(limited.status, 429);
		assert.equal(limited.body.code, 'rate_limited');
	});

	it('answers 503 sudo_unavailable when grobase is 404 (the OTP flag is off)', async (t) => {
		const otp = createOtpService({ email: ADDRESS, secret: ACCOUNT_JWT_SECRET, requestStatus: 404 });
		const { base, token } = await world(t, { otp });
		const response = await send(base, '/api/account/sudo/email', { method: 'POST', token });
		assert.equal(response.status, 503);
		assert.equal(response.body.code, 'sudo_unavailable');
	});

	it('answers 503 sudo_unavailable when grobase could not send the mail', async (t) => {
		const otp = createOtpService({ email: ADDRESS, secret: ACCOUNT_JWT_SECRET, requestStatus: 502, requestBody: { error: 'send_failed' } });
		const { base, token } = await world(t, { otp });
		const response = await send(base, '/api/account/sudo/email', { method: 'POST', token });
		assert.equal(response.status, 503);
		assert.equal(response.body.code, 'sudo_unavailable');
	});

	it('answers 503 sudo_unavailable and carries the Retry-After when Kong throttles the bridge', async (t) => {
		const otp = createOtpService({ email: ADDRESS, secret: ACCOUNT_JWT_SECRET, requestStatus: 429, requestHeaders: { 'retry-after': '42' } });
		const { base, token } = await world(t, { otp });
		const response = await send(base, '/api/account/sudo/email', { method: 'POST', token });
		assert.equal(response.status, 503);
		assert.equal(response.body.code, 'sudo_unavailable');
		assert.equal(response.body.retryAfterSeconds, 42);
		assert.equal(response.headers.get('retry-after'), '42');
	});

	it('answers 409 no_email when GoTrue has no address for the user', async (t) => {
		const otp = createOtpService({ email: ADDRESS, secret: ACCOUNT_JWT_SECRET, adminEmail: '' });
		const { base, token } = await world(t, { otp });
		const response = await send(base, '/api/account/sudo/email', { method: 'POST', token });
		assert.equal(response.status, 409);
		assert.equal(response.body.code, 'no_email');
	});

	it('answers 503 sudo_unavailable when the network is down', async (t) => {
		const otp = createOtpService({ email: ADDRESS, secret: ACCOUNT_JWT_SECRET, network: true });
		const { base, token } = await world(t, { otp });
		const response = await send(base, '/api/account/sudo/email', { method: 'POST', token });
		assert.equal(response.status, 503);
		assert.equal(response.body.code, 'sudo_unavailable');
	});

	it('writes the audit row of the attempt before it calls grobase', async (t) => {
		const { base, token, store } = await world(t);
		await send(base, '/api/account/sudo/email', { method: 'POST', token });
		const rows = store.rows('osionos_bridge_audit_events');
		assert.equal(rows.length, 1);
		assert.equal(rows[0].event_type, 'sudo.code_sent');
		assert.equal(rows[0].subject, USER_A);
	});

	it('answers 503 and sends nothing when the audit storage is down', async (t) => {
		const { base, token, otp } = await world(t, {
			fail: (call) => (call.table === 'osionos_bridge_audit_events' ? { status: 500, body: { message: 'down' } } : null),
		});
		const response = await send(base, '/api/account/sudo/email', { method: 'POST', token });
		assert.equal(response.status, 503);
		assert.equal(response.body.code, 'audit_unavailable');
		assert.equal(callsTo(otp, '/v1/auth/otp/request').length, 0);
	});
});

describe('POST /api/account/sudo/verify', () => {
	it('grants sudo on the session, and the state route reports it', async (t) => {
		const { base, token } = await world(t);
		const verified = await send(base, '/api/account/sudo/verify', { method: 'POST', token, body: { code: CODE } });
		assert.equal(verified.status, 204);
		const state = await send(base, '/api/account/sudo', { token });
		assert.equal(state.status, 200);
		assert.equal(state.body.active, true);
	});

	it('answers 422 when the code is not six digits', async (t) => {
		const { base, token, otp } = await world(t);
		for (const code of ['12345', '1234567', 'abcdef', '']) {
			const response = await send(base, '/api/account/sudo/verify', { method: 'POST', token, body: { code } });
			assert.equal(response.status, 422, `code ${code} answers ${response.status}`);
			assert.equal(response.body.code, 'code_invalid');
		}
		assert.equal(callsTo(otp, '/v1/auth/otp/verify').length, 0);
	});

	it('answers 422 code_invalid when grobase says the code is wrong (never 401)', async (t) => {
		const otp = createOtpService({ email: ADDRESS, secret: ACCOUNT_JWT_SECRET, verifyStatus: 401 });
		const { base, token } = await world(t, { otp });
		const response = await send(base, '/api/account/sudo/verify', { method: 'POST', token, body: { code: CODE } });
		assert.equal(response.status, 422);
		assert.equal(response.body.code, 'code_invalid');
	});

	it('answers 410 code_expired when grobase says the code expired', async (t) => {
		const otp = createOtpService({ email: ADDRESS, secret: ACCOUNT_JWT_SECRET, verifyStatus: 410 });
		const { base, token } = await world(t, { otp });
		const response = await send(base, '/api/account/sudo/verify', { method: 'POST', token, body: { code: CODE } });
		assert.equal(response.status, 410);
		assert.equal(response.body.code, 'code_expired');
	});

	it('answers 429 code_locked when grobase locked the code', async (t) => {
		const otp = createOtpService({ email: ADDRESS, secret: ACCOUNT_JWT_SECRET, verifyStatus: 429 });
		const { base, token } = await world(t, { otp });
		const response = await send(base, '/api/account/sudo/verify', { method: 'POST', token, body: { code: CODE } });
		assert.equal(response.status, 429);
		assert.equal(response.body.code, 'code_locked');
	});

	it('answers 503 sudo_unavailable when grobase is 404 (the OTP flag is off)', async (t) => {
		const otp = createOtpService({ email: ADDRESS, secret: ACCOUNT_JWT_SECRET, verifyStatus: 404 });
		const { base, token } = await world(t, { otp });
		const response = await send(base, '/api/account/sudo/verify', { method: 'POST', token, body: { code: CODE } });
		assert.equal(response.status, 503);
		assert.equal(response.body.code, 'sudo_unavailable');
	});

	// Every broken proof: a 502 and no sudo. The address is never the user's fault.
	const brokenProofs = {
		'a proof signed with another secret': { secret: 'another-secret' },
		'an alg: none header': { alg: 'none' },
		'an alg: HS512 header': { alg: 'HS512' },
		'a header that claims HS512 over a valid HS256 signature': { alg: 'HS512', signWith: 'sha256' },
		'an audience other than otp-proof': { aud: 'something-else' },
		'another address in the otp claim': { otp: 'someone.else@example.com' },
		'an expired proof': { expOffsetSeconds: -60 },
	};

	for (const [name, options] of Object.entries(brokenProofs)) {
		it(`answers 502 sudo_proof_invalid for ${name}, and grants nothing`, async (t) => {
			const proof = otpProof({ email: ADDRESS, secret: ACCOUNT_JWT_SECRET, ...options });
			const otp = createOtpService({ email: ADDRESS, secret: ACCOUNT_JWT_SECRET, proof });
			const { base, token, store } = await world(t, { otp });
			const response = await send(base, '/api/account/sudo/verify', { method: 'POST', token, body: { code: CODE } });
			assert.equal(response.status, 502);
			assert.equal(response.body.code, 'sudo_proof_invalid');
			const state = await send(base, '/api/account/sudo', { token });
			assert.equal(state.body.active, false);
			const rejections = store.rows('osionos_bridge_audit_events').filter((row) => row.event_type === 'sudo.proof_rejected');
			assert.equal(rejections.length, 1);
		});
	}

	it('answers 502 sudo_proof_invalid when grobase answers 200 with no proof', async (t) => {
		const otp = createOtpService({ email: ADDRESS, secret: ACCOUNT_JWT_SECRET, verifyBody: { verified: true } });
		const { base, token } = await world(t, { otp });
		const response = await send(base, '/api/account/sudo/verify', { method: 'POST', token, body: { code: CODE } });
		assert.equal(response.status, 502);
		assert.equal(response.body.code, 'sudo_proof_invalid');
	});

	it('answers 502 sudo_proof_invalid when the same proof is presented twice', async (t) => {
		const proof = otpProof({ email: ADDRESS, secret: ACCOUNT_JWT_SECRET });
		const otp = createOtpService({ email: ADDRESS, secret: ACCOUNT_JWT_SECRET, proof });
		const { base, token } = await world(t, { otp });
		const first = await send(base, '/api/account/sudo/verify', { method: 'POST', token, body: { code: CODE } });
		assert.equal(first.status, 204);
		const replay = await send(base, '/api/account/sudo/verify', { method: 'POST', token, body: { code: CODE } });
		assert.equal(replay.status, 502);
		assert.equal(replay.body.code, 'sudo_proof_invalid');
	});

	it('writes the audit row of the grant', async (t) => {
		const { base, token, store } = await world(t);
		await send(base, '/api/account/sudo/verify', { method: 'POST', token, body: { code: CODE } });
		const grants = store.rows('osionos_bridge_audit_events').filter((row) => row.event_type === 'sudo.granted');
		assert.equal(grants.length, 1);
	});

	it('answers 503 and grants nothing when the audit storage is down', async (t) => {
		const { base, token } = await world(t, {
			fail: (call) => (call.table === 'osionos_bridge_audit_events' ? { status: 500, body: { message: 'down' } } : null),
		});
		const response = await send(base, '/api/account/sudo/verify', { method: 'POST', token, body: { code: CODE } });
		assert.equal(response.status, 503);
		assert.equal(response.body.code, 'audit_unavailable');
		const state = await send(base, '/api/account/sudo', { token });
		assert.equal(state.body.active, false);
	});
});

describe('GET /api/account/sudo', () => {
	it('answers inactive for a session that never proved itself', async (t) => {
		const { base, token } = await world(t);
		const response = await send(base, '/api/account/sudo', { token });
		assert.equal(response.status, 200);
		assert.equal(response.body.active, false);
	});

	it('answers inactive once the ten minutes are up', async (t) => {
		const { base, token, clock } = await world(t);
		await send(base, '/api/account/sudo/verify', { method: 'POST', token, body: { code: CODE } });
		assert.equal((await send(base, '/api/account/sudo', { token })).body.active, true);
		clock.at += 10 * 60 * 1000 + 1;
		const expired = await send(base, '/api/account/sudo', { token });
		assert.equal(expired.status, 200);
		assert.equal(expired.body.active, false);
	});

	it('answers inactive for a second session of the same user', async (t) => {
		const { base, token, config } = await world(t);
		await send(base, '/api/account/sudo/verify', { method: 'POST', token, body: { code: CODE } });
		const other = sessionToken(config, USER_B);
		const response = await send(base, '/api/account/sudo', { token: other });
		assert.equal(response.body.active, false);
	});

	it('answers 503 sudo_unavailable when the secret is unset', async (t) => {
		const { base, token, otp } = await world(t, { env: {} });
		const sent = await send(base, '/api/account/sudo/email', { method: 'POST', token });
		assert.equal(sent.status, 503);
		assert.equal(sent.body.code, 'sudo_unavailable');
		const verified = await send(base, '/api/account/sudo/verify', { method: 'POST', token, body: { code: CODE } });
		assert.equal(verified.status, 503);
		assert.equal(verified.body.code, 'sudo_unavailable');
		const state = await send(base, '/api/account/sudo', { token });
		assert.equal(state.status, 503);
		assert.equal(state.body.code, 'sudo_unavailable');
		assert.equal(callsTo(otp, '/v1/auth/otp/request').length, 0);
	});
});

describe('the address never leaves', () => {
	it('is in no body, no header and no log line', async (t) => {
		const { base, token } = await world(t);
		const lines = [];
		const capture = (...args) => lines.push(args.map(String).join(' '));
		const original = { log: console.log, warn: console.warn, error: console.error, info: console.info };
		console.log = capture;
		console.warn = capture;
		console.error = capture;
		console.info = capture;
		try {
			const sent = await send(base, '/api/account/sudo/email', { method: 'POST', token });
			const verified = await send(base, '/api/account/sudo/verify', { method: 'POST', token, body: { code: CODE } });
			assert.equal(sent.status, 202);
			assert.equal(verified.status, 204);
			assert.doesNotMatch(sent.text, /ada\.lovelace@example\.com/);
			assert.doesNotMatch(verified.text, /ada\.lovelace@example\.com/);
			for (const [, value] of sent.headers) assert.doesNotMatch(String(value), /ada\.lovelace@example\.com/);
			for (const line of lines) assert.doesNotMatch(line, /ada\.lovelace@example\.com/);
		} finally {
			Object.assign(console, original);
		}
	});
});

describe('the route through the whole bridge', () => {
	it('answers the state of the grant, not the generic 404', async (t) => {
		const otp = createOtpService({ email: ADDRESS, secret: ACCOUNT_JWT_SECRET });
		const { base, config } = await startBridgeWorld(t, { otp, env: { JWT_SECRET: ACCOUNT_JWT_SECRET } });
		const response = await send(base, '/api/account/sudo', { token: sessionToken(config, USER_A) });
		assert.equal(response.status, 200);
		assert.equal(response.body.active, false);
	});
});

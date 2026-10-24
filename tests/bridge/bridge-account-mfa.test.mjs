/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-mfa.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Two-step verification end to end on a running bridge: enrol, confirm, step up, replay,
 * lockout, unenrol, and what the logs and the audit trail must never hold.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STEP_SECONDS, base32Decode, base32Encode, hotp, newSecret, sealSecret } from '../../scripts/bridge-account-mfa-totp.mjs';
import { CODES_TABLE, MFA_KEY, TOTP_TABLE, startMfaWorld, verifiedRow } from './support/mfa-world.mjs';
import { tokenClaims } from './support/session-signin.mjs';
import { USER_A } from './support/session-world.mjs';

const ENROL = '/api/account/2fa/enroll';
const VERIFY = '/api/account/2fa/verify';
const stepAt = (ms, offset = 0) => Math.floor(ms / 1000 / STEP_SECONDS) + offset;
const secretOf = (answer) => base32Decode(new URL(answer.body.otpauthUrl).searchParams.get('secret'));
const seal = (secret) => sealSecret(secret, USER_A, { OSIONOS_MFA_SECRET_KEY: MFA_KEY });
const wrongCode = (secret, ms) => ['000000', '111111'].find((code) => ![-1, 0, 1].some((offset) => hotp(secret, stepAt(ms, offset)) === code));
const verify = (world, token, code, ip) => world.api('POST', VERIFY, token, { body: { code }, ip });

async function enrol(world) {
	const { accessToken } = await world.signIn();
	await world.sudo(accessToken);
	const answer = await world.api('POST', ENROL, accessToken, { body: {} });
	return { accessToken, answer, secret: answer.status === 200 ? secretOf(answer) : null };
}

/** A world where USER_A already has a verified factor with a known secret. */
async function enrolledWorld(t, extra = {}) {
	const secret = newSecret();
	const world = await startMfaWorld(t, { totp: [verifiedRow(USER_A, seal(secret))], ...extra });
	return { world, secret };
}

describe('two-step verification: enrol and confirm', () => {
	it('stores a pending, sealed factor and returns only the otpauth URL, uncached', async (t) => {
		const world = await startMfaWorld(t);
		const { answer, secret } = await enrol(world);
		assert.equal(answer.status, 200, answer.text);
		assert.equal(answer.headers.get('cache-control'), 'no-store');
		assert.deepEqual(Object.keys(answer.body), ['otpauthUrl']);
		const [row] = world.mfa.rows(TOTP_TABLE);
		assert.deepEqual([row.status, row.user_id], ['pending', USER_A]);
		assert.match(row.secret_enc, /^v1\./);
		assert.ok(!JSON.stringify(row).includes(base32Encode(secret)), 'the stored row holds no readable secret');
	});

	it('needs a sudo window', async (t) => {
		const world = await startMfaWorld(t);
		const { accessToken } = await world.signIn();
		const answer = await world.api('POST', ENROL, accessToken, { body: {} });
		assert.deepEqual([answer.status, answer.body.code], [403, 'sudo_required']);
		assert.equal(world.mfa.rows(TOTP_TABLE).length, 0);
	});

	it('replaces a pending factor on a second enrol and keeps one row', async (t) => {
		const world = await startMfaWorld(t);
		const first = await enrol(world);
		const second = await world.api('POST', ENROL, first.accessToken, { body: {} });
		assert.equal(second.status, 200, second.text);
		assert.notDeepEqual(secretOf(second), first.secret);
		assert.equal(world.mfa.rows(TOTP_TABLE).length, 1);
	});

	it('answers 409 already_enrolled for a verified factor and writes nothing', async (t) => {
		const { world, secret } = await enrolledWorld(t);
		const { accessToken } = await world.signIn();
		const stepped = await verify(world, accessToken, hotp(secret, stepAt(world.clock.at)));
		await world.sudo(stepped.body.accessToken);
		const before = structuredClone(world.mfa.rows(TOTP_TABLE));
		const calls = world.mfa.calls.length;
		const answer = await world.api('POST', ENROL, stepped.body.accessToken, { body: {} });
		assert.deepEqual([answer.status, answer.body.code], [409, 'already_enrolled']);
		assert.deepEqual(world.mfa.rows(TOTP_TABLE), before);
		assert.deepEqual(world.mfa.calls.slice(calls).filter((call) => call.method !== 'GET'), []);
	});

	it('confirms with a good code: the cut-off lands before the flip, the old token dies, the new one lives', async (t) => {
		const world = await startMfaWorld(t);
		const { accessToken, secret } = await enrol(world);
		const wrong = await verify(world, accessToken, wrongCode(secret, world.clock.at));
		assert.deepEqual([wrong.status, wrong.body.code], [422, 'code_invalid']);
		assert.equal(world.mfa.rows(TOTP_TABLE)[0].status, 'pending');
		// A token minted in the same millisecond as the cut-off survives it, so the old one must be older.
		world.advance(1000);
		const done = await verify(world, accessToken, hotp(secret, stepAt(world.clock.at)));
		assert.equal(done.status, 200, done.text);
		assert.equal(world.mfa.rows(TOTP_TABLE)[0].status, 'verified');
		assert.equal(world.cutoffWrites.length, 1);
		const flip = world.mfa.calls.findIndex((call) => call.method === 'PATCH' && call.body?.status === 'verified');
		assert.ok(world.cutoffCallIndex[0] <= flip, 'cut-off written first');
		assert.equal((await world.api('GET', '/api/account/sessions', accessToken)).status, 401, 'the legacy token is dead');
		const fresh = await world.api('GET', '/api/account/sessions', done.body.accessToken);
		assert.equal(fresh.status, 200, fresh.text);
		assert.deepEqual([tokenClaims(done.body.accessToken).aal, tokenClaims(done.body.accessToken).mfa_req], [2, undefined]);
		assert.ok(!world.sessions.calls.some((call) => call.method === 'PATCH' && call.body?.created_at), 'a new root row replaces the re-date');
	});

	it('keeps the factor pending and answers 503 when the cut-off cannot be written', async (t) => {
		const world = await startMfaWorld(t);
		const { accessToken, secret } = await enrol(world);
		world.failCutoffWrite = true;
		const answer = await verify(world, accessToken, hotp(secret, stepAt(world.clock.at)));
		assert.equal(answer.status, 503, answer.text);
		assert.equal(world.mfa.rows(TOTP_TABLE)[0].status, 'pending');
		assert.equal(world.mfa.calls.filter((call) => call.method === 'PATCH' && call.body?.status === 'verified').length, 0);
	});

	it('revokes every personal access token on confirmation', async (t) => {
		const world = await startMfaWorld(t);
		const { accessToken, secret } = await enrol(world);
		await verify(world, accessToken, hotp(secret, stepAt(world.clock.at)));
		const patch = world.sessions.calls.find((call) => call.table === 'osionos_personal_access_tokens' && call.method === 'PATCH');
		assert.ok(patch, 'PATs were revoked');
		assert.equal(patch.params.get('user_id'), `eq.${USER_A}`);
	});

	it('still confirms when the session row cannot be re-dated (records off)', async (t) => {
		const world = await startMfaWorld(t, { records: 'off' });
		const { accessToken, secret } = await enrol(world);
		world.failSessionPatch = true;
		assert.equal((await verify(world, accessToken, hotp(secret, stepAt(world.clock.at)))).status, 200);
	});
});

describe('two-step verification: step-up, replay and the window', () => {
	it('upgrades an aal1 token to aal2 in a new family with the same expiry, and another aal1 token stays gated', async (t) => {
		const { world, secret } = await enrolledWorld(t);
		const { accessToken, claims } = await world.signIn();
		const gated = (await world.signIn()).accessToken;
		const done = await verify(world, accessToken, hotp(secret, stepAt(world.clock.at)));
		assert.equal(done.status, 200, done.text);
		const upgraded = tokenClaims(done.body.accessToken);
		assert.notEqual(upgraded.jti, claims.jti);
		assert.deepEqual([upgraded.exp, upgraded.aal, upgraded.mfa_req], [claims.exp, 2, undefined]);
		assert.equal((await world.api('GET', '/api/account/sessions', done.body.accessToken)).status, 200);
		assert.equal((await world.api('GET', '/api/account/sessions', gated)).body.code, 'mfa_required');
		assert.equal((await world.api('GET', '/api/account/sessions', accessToken)).status, 401, 'the replaced family is dead');
	});

	it('refuses a replayed code and sends the atomic last_step filter', async (t) => {
		const { world, secret } = await enrolledWorld(t);
		const { accessToken } = await world.signIn();
		const code = hotp(secret, stepAt(world.clock.at));
		const first = await verify(world, accessToken, code);
		assert.equal(first.status, 200);
		const replay = await verify(world, first.body.accessToken, code);
		assert.deepEqual([replay.status, replay.body.code], [422, 'code_invalid']);
		const claim = world.mfa.calls.filter((call) => call.method === 'PATCH' && call.params.has('last_step'));
		assert.ok(claim.every((call) => /^lt\.\d+$/.test(call.params.get('last_step')) && call.params.get('status') === 'eq.verified' && call.prefer.includes('return=representation')));
		assert.equal(world.mfa.rows(TOTP_TABLE)[0].last_step, stepAt(world.clock.at));
	});

	it('lets exactly one of two concurrent requests with the same code through', async (t) => {
		const { world, secret } = await enrolledWorld(t);
		const [one, two] = [await world.signIn(), await world.signIn()];
		const code = hotp(secret, stepAt(world.clock.at));
		world.mfa.frozenReads = structuredClone(world.mfa.rows(TOTP_TABLE));
		const answers = await Promise.all([verify(world, one.accessToken, code), verify(world, two.accessToken, code)]);
		assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 422]);
	});

	it('accepts a code from the next step and then refuses the current-step code (pinned, see the Caveat)', async (t) => {
		const { world, secret } = await enrolledWorld(t);
		const { accessToken } = await world.signIn();
		const early = await verify(world, accessToken, hotp(secret, stepAt(world.clock.at, 1)));
		assert.equal(early.status, 200, early.text);
		const late = await verify(world, early.body.accessToken, hotp(secret, stepAt(world.clock.at)));
		assert.deepEqual([late.status, late.body.code], [422, 'code_invalid']);
	});

	it('answers 409 not_enrolled for a user with no factor', async (t) => {
		const world = await startMfaWorld(t);
		const { accessToken } = await world.signIn();
		const answer = await verify(world, accessToken, '123456');
		assert.deepEqual([answer.status, answer.body.code], [409, 'not_enrolled']);
	});
});

describe('two-step verification: status and unenrol', () => {
	it('reports a user with no factor as not enabled', async (t) => {
		const world = await startMfaWorld(t);
		const { accessToken } = await world.signIn();
		assert.deepEqual((await world.api('GET', '/api/account/2fa/status', accessToken)).body, { enabled: false, methods: ['totp'], recoveryRemaining: 0, aal: 2 });
	});

	it('deletes the factor and the recovery codes, cuts the other sessions off, and returns a fresh aal2 token', async (t) => {
		const recovery = [{ user_id: USER_A, code_hmac: 'a'.repeat(64), used_at: null }, { user_id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', code_hmac: 'b'.repeat(64), used_at: null }];
		const { world, secret } = await enrolledWorld(t, { recovery });
		const { accessToken } = await world.signIn();
		const other = await world.signIn();
		const stepped = await verify(world, accessToken, hotp(secret, stepAt(world.clock.at)));
		await world.sudo(stepped.body.accessToken);
		world.advance(1000);
		const done = await world.api('POST', '/api/account/2fa/disable', stepped.body.accessToken, { body: {} });
		assert.equal(done.status, 200, done.text);
		assert.equal(world.mfa.rows(TOTP_TABLE).length, 0);
		assert.deepEqual(world.mfa.rows(CODES_TABLE).map((row) => row.user_id), ['bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb']);
		assert.equal((await world.api('GET', '/api/account/sessions', other.accessToken)).status, 401);
		assert.equal((await world.api('GET', '/api/account/sessions', done.body.accessToken)).status, 200);
	});

	it('deletes the codes before the factor, so a failure never leaves a factor without its codes', async (t) => {
		const recovery = [{ user_id: USER_A, code_hmac: 'a'.repeat(64), used_at: null }];
		const { world, secret } = await enrolledWorld(t, { recovery });
		const { accessToken } = await world.signIn();
		const stepped = await verify(world, accessToken, hotp(secret, stepAt(world.clock.at)));
		await world.sudo(stepped.body.accessToken);
		const serve = world.mfa.fetchImpl;
		let deletes = 0;
		world.mfa.fetchImpl = async (url, init = {}) => (init.method === 'DELETE' && (deletes += 1) === 2 ? new Response('{}', { status: 500 }) : serve(url, init));
		const failed = await world.api('POST', '/api/account/2fa/disable', stepped.body.accessToken, { body: {} });
		assert.notEqual(failed.status, 200);
		assert.equal(world.mfa.rows(CODES_TABLE).length, 0);
		assert.equal(world.mfa.rows(TOTP_TABLE).length, 1, 'the factor survives without codes, never the reverse');
	});

	it('needs a sudo window to unenrol', async (t) => {
		const { world, secret } = await enrolledWorld(t);
		const { accessToken } = await world.signIn();
		const stepped = await verify(world, accessToken, hotp(secret, stepAt(world.clock.at)));
		const answer = await world.api('POST', '/api/account/2fa/disable', stepped.body.accessToken, { body: {} });
		assert.deepEqual([answer.status, answer.body.code], [403, 'sudo_required']);
		assert.equal(world.mfa.rows(TOTP_TABLE).length, 1);
	});
});

describe('two-step verification: lockout', () => {
	const failuresFrom = async (world, token, secret, ip, count) => {
		const answers = [];
		for (let index = 0; index < count; index += 1) answers.push(await verify(world, token, wrongCode(secret, world.clock.at), ip));
		return answers;
	};

	it('blocks the fifth failing address with Retry-After, spares another address, never locks the account', async (t) => {
		const { world, secret } = await enrolledWorld(t);
		const { accessToken } = await world.signIn();
		const blocks = [];
		const setNx = world.kv.setNx.bind(world.kv);
		world.kv.setNx = (key, value, ttl) => { if (key.startsWith('mfa-block:')) blocks.push([key, ttl]); return setNx(key, value, ttl); };
		const answers = await failuresFrom(world, accessToken, secret, '203.0.113.1', 5);
		assert.ok(answers.every((answer) => answer.status === 422));
		const blocked = await verify(world, accessToken, hotp(secret, stepAt(world.clock.at)), '203.0.113.1');
		assert.equal(blocked.status, 429);
		assert.ok(Number(blocked.headers.get('retry-after')) > 0 && blocked.body.retryAfterSeconds > 0);
		assert.equal((await verify(world, accessToken, hotp(secret, stepAt(world.clock.at)), '203.0.113.2')).status, 200, 'another address is not locked out');
		assert.equal(blocks.length, 1);
		assert.equal(blocks[0][1], 30_000);
	});

	it('doubles the block for each failure past the fifth, capped at fifteen minutes', async (t) => {
		const { world, secret } = await enrolledWorld(t);
		const { accessToken } = await world.signIn();
		const ttls = [];
		const setNx = world.kv.setNx.bind(world.kv);
		world.kv.setNx = (key, value, ttl) => { if (key.startsWith('mfa-block:')) ttls.push(ttl); return setNx(key, value, ttl); };
		for (let count = 0; count < 12; count += 1) {
			for (const key of world.kv.keys().filter((name) => name.includes('mfa-block:'))) world.kv.values.delete(key);
			await verify(world, accessToken, wrongCode(secret, world.clock.at), '203.0.113.9');
		}
		assert.deepEqual(ttls.slice(0, 4), [30_000, 60_000, 120_000, 240_000]);
		assert.equal(Math.max(...ttls), 900_000);
	});

	it('counts fifty failures across addresses into one audit row and still blocks nobody', async (t) => {
		const { world, secret } = await enrolledWorld(t);
		const { accessToken } = await world.signIn();
		const statuses = [];
		for (let index = 0; index < 50; index += 1) statuses.push((await verify(world, accessToken, wrongCode(secret, world.clock.at), `198.51.100.${index % 20 + 10}`)).status);
		assert.ok(statuses.every((status) => status === 422), statuses.join(','));
		assert.equal(world.audit().filter((row) => row.event_type === 'account.2fa.bruteforce_suspected').length, 1);
	});
});

describe('two-step verification: secrets stay out of every log', () => {
	it('keeps the secret, codes, otpauth URL, key and hashes out of the console, the store log and the audit rows', async (t) => {
		const logged = [];
		for (const level of ['log', 'info', 'warn', 'error']) t.mock.method(console, level, (...args) => logged.push(args.join(' ')));
		const world = await startMfaWorld(t);
		const { accessToken, secret, answer } = await enrol(world);
		const code = hotp(secret, stepAt(world.clock.at));
		await verify(world, accessToken, wrongCode(secret, world.clock.at));
		await verify(world, accessToken, code);
		const everything = JSON.stringify([logged, world.mfa.calls.map((call) => [call.params.toString(), call.text]), world.sessions.calls.map((call) => call.text ?? call.body), world.audit()]);
		for (const forbidden of [base32Encode(secret), code, answer.body.otpauthUrl, 'otpauth://', MFA_KEY]) assert.ok(!everything.includes(forbidden), `leaked ${forbidden.slice(0, 8)}`);
		const events = world.audit().map((row) => row.event_type);
		assert.ok(events.includes('account.2fa.enrol'));
		assert.ok(world.audit().every((row) => JSON.stringify(row.details).length <= 2048));
	});
});

describe('two-step verification: the key is missing', () => {
	it('answers 503 on the 2fa routes, still signs a factor-less user in, and still gates a user who has a factor', async (t) => {
		const gated = await startMfaWorld(t, { env: {}, totp: [verifiedRow(USER_A, seal(newSecret()))] });
		const { claims, accessToken } = await gated.signIn();
		assert.deepEqual([claims.aal, claims.mfa_req], [1, true]);
		const stepUp = await verify(gated, accessToken, '123456');
		assert.deepEqual([stepUp.status, stepUp.body.code], [503, 'mfa_unavailable']);
		const bare = await startMfaWorld(t, { env: {} });
		const signedIn = await bare.signIn();
		assert.equal(signedIn.claims.mfa_req, undefined);
		await bare.sudo(signedIn.accessToken);
		const enrolAnswer = await bare.api('POST', ENROL, signedIn.accessToken, { body: {} });
		assert.deepEqual([enrolAnswer.status, enrolAnswer.body.code], [503, 'mfa_unavailable']);
		assert.equal(bare.mfa.rows(TOTP_TABLE).length, 0);
	});
});

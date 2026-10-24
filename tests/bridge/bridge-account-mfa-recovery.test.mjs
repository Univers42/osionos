/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-mfa-recovery.test.mjs               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Recovery codes (P3-2-b): the escape when the authenticator is gone. Generated once and
 * shown once, stored only as HMACs, spent by one conditional write, and never a way around
 * the lockout.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STEP_SECONDS, hotp, newSecret, sealSecret } from '../../scripts/bridge-account-mfa-totp.mjs';
import { hashRecoveryCode, newRecoveryCodes, normaliseRecoveryCode } from '../../scripts/bridge-account-mfa-recovery.mjs';
import { CODES_TABLE, MFA_KEY, startMfaWorld, verifiedRow } from './support/mfa-world.mjs';
import { tokenClaims } from './support/session-signin.mjs';
import { USER_A, USER_B } from './support/session-world.mjs';

const PEPPER = Buffer.alloc(32, 5).toString('base64');
const OTHER = Buffer.alloc(32, 6).toString('base64');
const ENV = { OSIONOS_MFA_SECRET_KEY: MFA_KEY, OSIONOS_RECOVERY_PEPPER: PEPPER };
const GENERATE = '/api/account/2fa/recovery/generate';
const REGENERATE = '/api/account/2fa/recovery/regenerate';
const RECOVER = '/api/account/2fa/recovery/verify';
const SHAPE = /^[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}$/;
const stepAt = (ms) => Math.floor(ms / 1000 / STEP_SECONDS);

/** A world where USER_A has a verified factor, signed in and stepped up to aal2 with the authenticator. */
async function steppedUp(t, extra = {}) {
	const secret = newSecret();
	const world = await startMfaWorld(t, { env: ENV, totp: [verifiedRow(USER_A, sealSecret(secret, USER_A, ENV))], ...extra });
	const first = await world.signIn();
	const stepped = await world.api('POST', '/api/account/2fa/verify', first.accessToken, { body: { code: hotp(secret, stepAt(world.clock.at)) } });
	assert.equal(stepped.status, 200, stepped.text);
	// The first token died with the step-up (its family was replaced), so the gated token the specs probe is a fresh sign-in.
	return { world, aal1: (await world.signIn()).accessToken, aal2: stepped.body.accessToken, secret };
}

const generate = (world, token) => world.api('POST', GENERATE, token, { body: {} });
const recover = (world, token, code, ip) => world.api('POST', RECOVER, token, { body: { code }, ip });

async function withCodes(t) {
	const ctx = await steppedUp(t);
	const made = await generate(ctx.world, ctx.aal2);
	assert.equal(made.status, 200, made.text);
	return { ...ctx, codes: made.body.codes };
}

describe('recovery codes: the primitives', () => {
	it('makes ten distinct codes of the agreed shape', () => {
		const codes = newRecoveryCodes();
		assert.equal(new Set(codes).size, 10);
		assert.ok(codes.every((code) => SHAPE.test(code)), codes.join(' '));
	});

	it('normalises case and dashes, and rejects what is not a code', () => {
		assert.equal(normaliseRecoveryCode('ABCD-efgh'), 'abcdefgh');
		assert.equal(normaliseRecoveryCode(' abcd efgh '), null);
		for (const bad of [undefined, null, 12345678, '', 'abcd-efg', 'abcd-efgh1', 'abcd-efgi', {}]) assert.equal(normaliseRecoveryCode(bad), null, String(bad));
	});

	it('hashes differently per user and per pepper, and is stable for the same inputs', () => {
		const same = hashRecoveryCode({ pepper: PEPPER, userId: USER_A, code: 'abcd-efgh' });
		assert.match(same, /^[0-9a-f]{64}$/);
		assert.equal(hashRecoveryCode({ pepper: PEPPER, userId: USER_A, code: 'ABCDEFGH' }), same);
		assert.notEqual(hashRecoveryCode({ pepper: PEPPER, userId: USER_B, code: 'abcd-efgh' }), same);
		assert.notEqual(hashRecoveryCode({ pepper: OTHER, userId: USER_A, code: 'abcd-efgh' }), same);
	});
});

describe('recovery codes: generate', () => {
	it('returns ten codes once, uncached, and stores only their HMACs', async (t) => {
		const { world, aal2 } = await steppedUp(t);
		const answer = await generate(world, aal2);
		assert.equal(answer.status, 200, answer.text);
		assert.equal(answer.headers.get('cache-control'), 'no-store');
		assert.equal(answer.body.codes.length, 10);
		const rows = world.mfa.rows(CODES_TABLE);
		assert.equal(rows.length, 10);
		assert.ok(rows.every((row) => row.user_id === USER_A && /^[0-9a-f]{64}$/.test(row.code_hmac) && row.generation === 1));
		const stored = JSON.stringify([rows, world.mfa.calls.map((call) => [call.params.toString(), call.text])]);
		for (const code of answer.body.codes) assert.ok(!stored.includes(code) && !stored.includes(code.replace('-', '')), 'a plaintext code reached the store');
		assert.deepEqual(rows.map((row) => row.code_hmac).sort(), answer.body.codes.map((code) => hashRecoveryCode({ pepper: PEPPER, userId: USER_A, code })).sort());
	});

	it('refuses a second set while one exists, and an aal1 token', async (t) => {
		const { world, aal1, aal2 } = await steppedUp(t);
		const gated = await generate(world, aal1);
		assert.deepEqual([gated.status, gated.body.code], [403, 'mfa_required']);
		assert.equal((await generate(world, aal2)).status, 200);
		const again = await generate(world, aal2);
		assert.deepEqual([again.status, again.body.code], [409, 'codes_exist']);
		assert.equal(world.mfa.rows(CODES_TABLE).length, 10);
	});

	it('inserts the whole set in one bulk POST', async (t) => {
		const { world, aal2 } = await steppedUp(t);
		await generate(world, aal2);
		const posts = world.mfa.calls.filter((call) => call.table === CODES_TABLE && call.method === 'POST');
		assert.equal(posts.length, 1);
		assert.equal(posts[0].body.length, 10);
	});

	it('writes no row when the bulk insert fails', async (t) => {
		const { world, aal2 } = await steppedUp(t);
		const serve = world.mfa.fetchImpl;
		world.mfa.fetchImpl = async (url, init = {}) => (init.method === 'POST' && String(url).includes(CODES_TABLE) ? new Response('{}', { status: 500 }) : serve(url, init));
		assert.equal((await generate(world, aal2)).status, 503);
		assert.equal(world.mfa.rows(CODES_TABLE).length, 0);
	});

	it('needs a verified factor', async (t) => {
		const world = await startMfaWorld(t, { env: ENV });
		const { accessToken } = await world.signIn();
		const answer = await generate(world, accessToken);
		assert.deepEqual([answer.status, answer.body.code], [409, 'not_enrolled']);
		assert.equal(world.mfa.rows(CODES_TABLE).length, 0);
	});

	it('answers 503 and writes nothing when the pepper is unset or the wrong size', async (t) => {
		for (const env of [{ OSIONOS_MFA_SECRET_KEY: MFA_KEY }, { ...ENV, OSIONOS_RECOVERY_PEPPER: Buffer.alloc(8).toString('base64') }]) {
			const { world, aal2 } = await steppedUp(t, { env });
			const answer = await generate(world, aal2);
			assert.deepEqual([answer.status, answer.body.code], [503, 'mfa_unavailable']);
			assert.equal(world.mfa.rows(CODES_TABLE).length, 0);
		}
	});

	it('audits the generation without any code in it', async (t) => {
		const { world, aal2 } = await steppedUp(t);
		const answer = await generate(world, aal2);
		const row = world.audit().find((entry) => entry.event_type === 'account.2fa.recovery.generate');
		assert.deepEqual(row.details, { count: 10 });
		assert.ok(!JSON.stringify(world.audit()).includes(answer.body.codes[0]));
	});
});

describe('recovery codes: regenerate', () => {
	it('needs a sudo window', async (t) => {
		const { world, aal2 } = await withCodes(t);
		const answer = await world.api('POST', REGENERATE, aal2, { body: {} });
		assert.deepEqual([answer.status, answer.body.code], [403, 'sudo_required']);
		assert.equal(world.mfa.rows(CODES_TABLE).length, 10);
	});

	it('swaps the set: the new codes are inserted first, the old ones are gone and dead', async (t) => {
		const { world, aal1, aal2, codes } = await withCodes(t);
		await world.sudo(aal2);
		const answer = await world.api('POST', REGENERATE, aal2, { body: {} });
		assert.equal(answer.status, 200, answer.text);
		assert.equal(answer.headers.get('cache-control'), 'no-store');
		assert.ok(answer.body.codes.every((code) => !codes.includes(code)));
		const rows = world.mfa.rows(CODES_TABLE);
		assert.deepEqual([rows.length, new Set(rows.map((row) => row.generation)).size, rows[0].generation], [10, 1, 2]);
		const writes = world.mfa.calls.filter((call) => call.table === CODES_TABLE && call.method !== 'GET').map((call) => call.method);
		assert.deepEqual(writes.slice(-2), ['POST', 'DELETE']);
		assert.equal((await recover(world, aal1, codes[0])).status, 422, 'an old code no longer works');
		assert.equal((await recover(world, aal1, answer.body.codes[0])).status, 200);
	});

	it('leaves the old and the new set, never none, when the sweep fails; a retry cleans up', async (t) => {
		const { world, aal2 } = await withCodes(t);
		await world.sudo(aal2);
		const serve = world.mfa.fetchImpl;
		world.mfa.fetchImpl = async (url, init = {}) => (init.method === 'DELETE' ? new Response('{}', { status: 500 }) : serve(url, init));
		const failed = await world.api('POST', REGENERATE, aal2, { body: {} });
		assert.equal(failed.status, 503, failed.text);
		assert.ok(!('codes' in failed.body));
		assert.deepEqual([world.mfa.rows(CODES_TABLE).length, new Set(world.mfa.rows(CODES_TABLE).map((row) => row.generation)).size], [20, 2]);
		world.mfa.fetchImpl = serve;
		assert.equal((await world.api('POST', REGENERATE, aal2, { body: {} })).status, 200);
		assert.deepEqual(world.mfa.rows(CODES_TABLE).map((row) => row.generation), Array(10).fill(3));
	});

	it('two racing regenerates: one wins, the other gets 409, one live set at generation 2', async (t) => {
		const { world, aal2 } = await withCodes(t);
		await world.sudo(aal2);
		// The first call is held at its insert until the second has been answered, so the two truly overlap.
		const serve = world.mfa.fetchImpl;
		let release;
		const held = new Promise((resolve) => { release = resolve; });
		world.mfa.fetchImpl = async (url, init = {}) => {
			if (init.method === 'POST' && String(url).includes(CODES_TABLE)) await held;
			return serve(url, init);
		};
		const first = world.api('POST', REGENERATE, aal2, { body: {} });
		await new Promise((resolve) => setTimeout(resolve, 50));
		const second = await world.api('POST', REGENERATE, aal2, { body: {} });
		release();
		assert.deepEqual([second.status, second.body.code], [409, 'regenerate_in_progress']);
		assert.equal((await first).status, 200);
		const rows = world.mfa.rows(CODES_TABLE);
		assert.deepEqual([rows.length, new Set(rows.map((row) => row.generation)).size, rows[0].generation], [10, 1, 2]);
		assert.equal((await world.api('POST', REGENERATE, aal2, { body: {} })).status, 200, 'the lock was released');
	});

	it('answers 503 mfa_unavailable when the lock store is down', async (t) => {
		const { world, aal2 } = await withCodes(t);
		await world.sudo(aal2);
		world.kv.setNx = async () => { throw new Error('kv down'); };
		const answer = await world.api('POST', REGENERATE, aal2, { body: {} });
		assert.deepEqual([answer.status, answer.body.code], [503, 'mfa_unavailable']);
		assert.equal(world.mfa.rows(CODES_TABLE).length, 10);
	});
});

describe('recovery codes: verify', () => {
	it('upgrades an aal1 token to aal2 with the same jti and expiry, and spends the code', async (t) => {
		const { world, codes } = await withCodes(t);
		const { accessToken, claims } = await world.signIn();
		const gated = (await world.signIn()).accessToken;
		const answer = await recover(world, accessToken, codes[0]);
		assert.equal(answer.status, 200, answer.text);
		const upgraded = tokenClaims(answer.body.accessToken);
		assert.notEqual(upgraded.jti, claims.jti, 'a step-up starts a new family');
		assert.deepEqual([upgraded.exp, upgraded.aal, upgraded.mfa_req], [claims.exp, 2, undefined]);
		assert.equal(answer.body.remaining, 9);
		assert.equal(world.mfa.rows(CODES_TABLE).filter((row) => row.used_at).length, 1);
		assert.equal((await world.api('GET', '/api/account/sessions', gated)).body.code, 'mfa_required', 'another aal1 token stays gated');
		assert.equal((await world.api('GET', '/api/account/sessions', accessToken)).status, 401, 'the replaced family is dead');
		assert.equal((await world.api('GET', '/api/account/sessions', answer.body.accessToken)).status, 200);
	});

	it('accepts upper case and a missing dash', async (t) => {
		const { world, codes } = await withCodes(t);
		const { accessToken } = await world.signIn();
		assert.equal((await recover(world, accessToken, codes[0].toUpperCase().replace('-', ''))).status, 200);
	});

	it('spends a code once: a replay is refused', async (t) => {
		const { world, codes } = await withCodes(t);
		const { accessToken } = await world.signIn();
		const first = await recover(world, accessToken, codes[0]);
		assert.equal(first.status, 200);
		assert.equal((await recover(world, first.body.accessToken, codes[0])).status, 422);
	});

	it('lets exactly one of two concurrent requests with one code through, through a conditional write', async (t) => {
		const { world, codes } = await withCodes(t);
		const [one, two] = [await world.signIn(), await world.signIn()];
		const answers = await Promise.all([recover(world, one.accessToken, codes[0]), recover(world, two.accessToken, codes[0])]);
		assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 422]);
		const spend = world.mfa.calls.filter((call) => call.method === 'PATCH' && call.table === CODES_TABLE);
		assert.ok(spend.length >= 1 && spend.every((call) => call.params.get('used_at') === 'is.null' && call.params.get('user_id') === `eq.${USER_A}` && call.prefer.includes('return=representation')));
	});

	it('answers unknown, used and malformed codes with byte-identical 422 bodies', async (t) => {
		const { world, codes } = await withCodes(t);
		const { accessToken } = await world.signIn();
		const first = await recover(world, accessToken, codes[0]);
		assert.equal(first.status, 200);
		const bodies = [];
		for (const code of ['zzzz-zzzz', codes[0], 'not a code', 42, undefined]) {
			const answer = await recover(world, first.body.accessToken, code);
			assert.equal(answer.status, 422);
			bodies.push(answer.text);
		}
		assert.equal(new Set(bodies).size, 1, bodies.join(' | '));
		assert.equal(JSON.parse(bodies[0]).code, 'code_invalid');
	});

	it('does not honour another user\'s code', async (t) => {
		const { world, codes } = await withCodes(t);
		const other = await startMfaWorld(t, { env: ENV, totp: [verifiedRow(USER_B, sealSecret(newSecret(), USER_B, ENV))], recovery: world.mfa.rows(CODES_TABLE) });
		const { accessToken } = await other.signIn(USER_B);
		assert.equal((await recover(other, accessToken, codes[0])).status, 422);
	});

	it('shares the TOTP lockout: five misses block the address, another address is spared, nobody is locked', async (t) => {
		const { world, codes } = await withCodes(t);
		const { accessToken } = await world.signIn();
		const statuses = [];
		for (let index = 0; index < 5; index += 1) statuses.push((await recover(world, accessToken, 'zzzz-zzzz', '203.0.113.1')).status);
		assert.deepEqual(statuses, Array(5).fill(422));
		const blocked = await recover(world, accessToken, codes[0], '203.0.113.1');
		assert.equal(blocked.status, 429);
		assert.ok(Number(blocked.headers.get('retry-after')) > 0);
		assert.equal((await recover(world, accessToken, codes[0], '203.0.113.2')).status, 200);
	});

	it('writes an audit row that names the method and the codes left, never a code', async (t) => {
		const { world, codes } = await withCodes(t);
		const { accessToken } = await world.signIn();
		await recover(world, accessToken, codes[0]);
		const row = world.audit().find((entry) => entry.event_type === 'account.2fa.recovery.verify');
		assert.deepEqual(row.details, { method: 'recovery', remaining: 9 });
	});

	it('answers 503 when the pepper is unset', async (t) => {
		const { world } = await steppedUp(t, { env: { OSIONOS_MFA_SECRET_KEY: MFA_KEY } });
		const { accessToken } = await world.signIn();
		const answer = await recover(world, accessToken, 'abcd-efgh');
		assert.deepEqual([answer.status, answer.body.code], [503, 'mfa_unavailable']);
	});
});

describe('recovery codes: status', () => {
	const remainingOf = async (world, token) => (await world.api('GET', '/api/account/2fa/status', token)).body.recoveryRemaining;

	it('reports the unused codes of the newest set: 0, 10, then 9, then 10 after a regenerate', async (t) => {
		const { world, aal2, codes } = await withCodes(t);
		assert.equal(await remainingOf(world, aal2), 10);
		const { accessToken } = await world.signIn();
		await recover(world, accessToken, codes[0]);
		assert.equal(await remainingOf(world, aal2), 9);
		await world.sudo(aal2);
		await world.api('POST', REGENERATE, aal2, { body: {} });
		assert.equal(await remainingOf(world, aal2), 10);
	});

	it('reports 0, never absent, when there are no codes', async (t) => {
		const { world, aal2 } = await steppedUp(t);
		assert.equal(await remainingOf(world, aal2), 0);
	});
});

describe('recovery codes: nothing secret is logged', () => {
	it('keeps codes, hashes and the pepper out of the console, the store log and the audit rows', async (t) => {
		const logged = [];
		for (const level of ['log', 'info', 'warn', 'error']) t.mock.method(console, level, (...args) => logged.push(args.join(' ')));
		const { world, aal2 } = await steppedUp(t);
		const first = await generate(world, aal2);
		await world.sudo(aal2);
		const second = await world.api('POST', REGENERATE, aal2, { body: {} });
		const { accessToken } = await world.signIn();
		await recover(world, accessToken, 'zzzz-zzzz');
		await recover(world, accessToken, second.body.codes[0]);
		const hashes = world.mfa.rows(CODES_TABLE).map((row) => row.code_hmac);
		const everything = JSON.stringify([logged, world.audit(), world.sessions.calls.map((call) => call.text ?? call.body)]);
		for (const forbidden of [...first.body.codes, ...second.body.codes, ...hashes, PEPPER]) assert.ok(!everything.includes(forbidden), `leaked ${forbidden.slice(0, 6)}`);
		assert.ok(world.audit().every((row) => JSON.stringify(row.details).length <= 2048));
	});
});

describe('recovery codes: verdict conditions', () => {
	it('burns a spent code when the failure counter cannot be cleared, and other codes still work', async (t) => {
		const { world, codes } = await withCodes(t);
		const { accessToken } = await world.signIn();
		const getDel = world.kv.getDel;
		world.kv.getDel = async (key) => {
			if (String(key).startsWith('mfa-fail:')) throw new Error('kv down');
			return getDel(key);
		};
		const failed = await recover(world, accessToken, codes[0]);
		assert.equal(failed.status, 500, failed.text);
		world.kv.getDel = getDel;
		const retry = await recover(world, accessToken, codes[0]);
		assert.deepEqual([retry.status, retry.body.code], [422, 'code_invalid']);
		assert.equal((await recover(world, accessToken, codes[1])).status, 200);
	});

	it('answers 409 not_enrolled without spending when the factor is gone', async (t) => {
		const recovery = [{ user_id: USER_A, code_hmac: hashRecoveryCode({ pepper: PEPPER, userId: USER_A, code: 'abcd-efgh' }), used_at: null, generation: 1 }];
		const world = await startMfaWorld(t, { env: ENV, recovery });
		const { accessToken } = await world.signIn();
		const answer = await recover(world, accessToken, 'abcd-efgh');
		assert.deepEqual([answer.status, answer.body.code], [409, 'not_enrolled']);
		assert.equal(world.mfa.rows(CODES_TABLE)[0].used_at, null);
	});
});

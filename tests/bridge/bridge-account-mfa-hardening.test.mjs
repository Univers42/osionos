/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-mfa-hardening.test.mjs              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The devil's conditions on two-step verification (D-P3-2a): the gate and the lockout fail
 * closed when the deploy is half configured, failures are counted before the compare, and a
 * failed side effect aborts a confirmation before the factor goes live.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBridgeHandoff, validateBridgePayload } from '../../scripts/bridge-api.mjs';
import { mfaBootLine } from '../../scripts/bridge-account-mfa-state.mjs';
import { hotp, newSecret, openSecret, sealSecret, STEP_SECONDS } from '../../scripts/bridge-account-mfa-totp.mjs';
import { MFA_KEY, TOTP_TABLE, noFactorPg, startMfaWorld, verifiedRow } from './support/mfa-world.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { USER_A, USER_B, sessionConfig } from './support/session-world.mjs';

const VERIFY = '/api/account/2fa/verify';
const stepAt = (ms, offset = 0) => Math.floor(ms / 1000 / STEP_SECONDS) + offset;
const sealFor = (secret, userId) => sealSecret(secret, userId, { OSIONOS_MFA_SECRET_KEY: MFA_KEY });
const wrongCode = (secret, ms) => ['000000', '111111'].find((code) => ![-1, 0, 1].some((offset) => hotp(secret, stepAt(ms, offset)) === code));
const verify = (world, token, code, ip) => world.api('POST', VERIFY, token, { body: { code }, ip });
const source = (name) => readFileSync(new URL(`../../scripts/${name}`, import.meta.url), 'utf8');

describe('condition 1: an unset client address header', () => {
	it('answers a wrong code with 422, counts it, and blocks after five', async (t) => {
		const secret = newSecret();
		const world = await startMfaWorld(t, { ipHeader: '', totp: [verifiedRow(USER_A, sealFor(secret, USER_A))] });
		const { accessToken } = await world.signIn();
		const answers = [];
		for (let index = 0; index < 6; index += 1) answers.push((await verify(world, accessToken, wrongCode(secret, world.clock.at), null)).status);
		assert.deepEqual(answers, [422, 422, 422, 422, 422, 429]);
	});

	it('keeps one user\'s wrong codes out of every other user\'s bucket', async (t) => {
		const [secretA, secretB] = [newSecret(), newSecret()];
		const world = await startMfaWorld(t, { ipHeader: '', totp: [verifiedRow(USER_A, sealFor(secretA, USER_A)), verifiedRow(USER_B, sealFor(secretB, USER_B))] });
		const a = await world.signIn(USER_A);
		const b = await world.signIn(USER_B);
		for (let index = 0; index < 31; index += 1) await verify(world, a.accessToken, wrongCode(secretA, world.clock.at), null);
		const answer = await verify(world, b.accessToken, hotp(secretB, stepAt(world.clock.at)), null);
		assert.equal(answer.status, 200, answer.text);
	});

	it('warns at boot that the address header is unset', () => {
		assert.match(mfaBootLine(sessionConfig({ ipHeader: '' }), {}), /client_ip_header=unset/);
		assert.match(mfaBootLine(sessionConfig({ ipHeader: 'x-forwarded-for' }), {}), /client_ip_header=set/);
	});
});

describe('condition 2: the gate is open only without BaaS', () => {
	const payload = validateBridgePayload({ provider: 'prismatica', subject: USER_A, email: 'member@example.com', name: 'Member', jti: '6f1d0c1e-2b3a-4c5d-8e9f-0a1b2c3d4e5f' });
	const mint = (config, pg) => createBridgeHandoff({ payload, config, kv: kvStub(), pg, fetchImpl: async () => new Response('[]') });

	it('refuses to mint with a BaaS URL and no service key', async () => {
		const config = { ...sessionConfig(), serviceKey: '' };
		assert.ok(config.baasUrl);
		await assert.rejects(mint(config, noFactorPg()), (error) => error.status === 503 && error.code === 'mfa_unavailable');
		assert.match(mfaBootLine(config, {}), /mfa_gate=on/);
	});

	it('mints without a BaaS URL', async () => {
		assert.ok((await mint({ ...sessionConfig(), baasUrl: '', serviceKey: '' })).redirectUrl);
	});
});

describe('condition 3: key state at boot and a bad previous key', () => {
	const states = [['set', { OSIONOS_MFA_SECRET_KEY: MFA_KEY }], ['unset', {}], ['invalid', { OSIONOS_MFA_SECRET_KEY: 'AAAA' }]];
	for (const [name, env] of states) {
		it(`prints mfa_key=${name}`, () => assert.match(mfaBootLine(sessionConfig(), env), new RegExp(`mfa_key=${name}\\b`)));
	}

	it('never prints the key', () => assert.ok(!mfaBootLine(sessionConfig(), { OSIONOS_MFA_SECRET_KEY: MFA_KEY }).includes(MFA_KEY)));

	it('opens a row sealed under the current key when the previous key is malformed', () => {
		const env = { OSIONOS_MFA_SECRET_KEY: MFA_KEY, OSIONOS_MFA_SECRET_KEY_PREVIOUS: Buffer.alloc(5).toString('base64') };
		const secret = newSecret();
		assert.deepEqual(openSecret(sealFor(secret, USER_A), USER_A, env), secret);
	});
});

describe('condition 5: the failure is counted before the code is compared', () => {
	it('lets at most five of ten parallel wrong codes from one address reach the compare', async (t) => {
		const secret = newSecret();
		const world = await startMfaWorld(t, { totp: [verifiedRow(USER_A, sealFor(secret, USER_A))] });
		const { accessToken } = await world.signIn();
		const code = wrongCode(secret, world.clock.at);
		// Every request is parked on its factor read: only a request that was refused before the compare can skip the park.
		let release;
		world.mfa.holdReads = new Promise((done) => { release = done; });
		const pending = Array.from({ length: 10 }, () => verify(world, accessToken, code));
		await new Promise((done) => setTimeout(done, 300));
		release();
		const answers = await Promise.all(pending);
		const statuses = answers.map((answer) => answer.status);
		assert.equal(statuses.filter((status) => status === 422).length, 5, statuses.join());
		assert.equal(statuses.filter((status) => status === 429).length, 5, statuses.join());
	});
});

describe('condition 6 and 9: the caveats say what they cost', () => {
	it('names the refusal after a +1-step code', () => assert.match(source('bridge-account-mfa.mjs'), /\+1-step code refuses the current-step code for up to 30 s/));
	it('names the poller interval as the multi-instance window', () => assert.match(source('bridge-account-mfa.mjs'), /other instances[^]*poller[^]*10 s/));
});

describe('condition 7: enrol over a row that changed under it', () => {
	it('answers 409 when the pending row it meant to replace is already verified', async (t) => {
		const secret = newSecret();
		const world = await startMfaWorld(t, { totp: [verifiedRow(USER_A, sealFor(secret, USER_A), { status: 'pending', verified_at: null })] });
		const { accessToken } = await world.signIn();
		await world.sudo(accessToken);
		world.mfa.frozenReads = [{ ...world.mfa.rows(TOTP_TABLE)[0] }];
		world.mfa.rows(TOTP_TABLE)[0].status = 'verified';
		const answer = await world.api('POST', '/api/account/2fa/enroll', accessToken, { body: {} });
		assert.equal(answer.status, 409, answer.text);
		assert.equal(world.mfa.rows(TOTP_TABLE)[0].status, 'verified');
	});
});

describe('condition 8: a failing PAT revoke aborts before the flip', () => {
	it('answers 503 and leaves the factor pending', async (t) => {
		const secret = newSecret();
		const world = await startMfaWorld(t, { totp: [verifiedRow(USER_A, sealFor(secret, USER_A), { status: 'pending', verified_at: null })] });
		const { accessToken } = await world.signIn();
		world.failPatRevoke = true;
		const answer = await verify(world, accessToken, hotp(secret, stepAt(world.clock.at)));
		assert.deepEqual([answer.status, answer.body.code], [503, 'mfa_unavailable']);
		assert.equal(world.mfa.rows(TOTP_TABLE)[0].status, 'pending');
	});
});

describe('condition 11: more routes refuse an aal1 token', () => {
	const routes = [['POST', '/api/realtime/token'], ['POST', '/api/rtc/token'], ['POST', '/api/ide/token'], ['GET', `/api/workspaces/${USER_A}/members`]];
	for (const [method, path] of routes) {
		it(`answers 403 second-step-required on ${method} ${path}`, async (t) => {
			const world = await startMfaWorld(t, { totp: [verifiedRow(USER_A, sealFor(newSecret(), USER_A))] });
			const { accessToken } = await world.signIn();
			process.env.OSIONOS_IDE_TOKEN_SECRET = 'ide-token-secret-for-the-mfa-gate-test';
			t.after(() => { delete process.env.OSIONOS_IDE_TOKEN_SECRET; });
			const answer = await world.api(method, path, accessToken, { body: method === 'POST' ? {} : undefined });
			// These handlers answer through their own error writer, which drops the `code` field.
			assert.deepEqual([answer.status, answer.body?.message], [403, 'A second verification step is required.'], answer.text);
		});
	}
});

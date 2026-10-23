/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-mfa-gate.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The AAL2 gate: which tokens the bridge mints for a user with a verified factor, what such a
 * token may and may not do, and every way the factor lookup can fail (always closed).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createBridgeHandoff, validateBridgePayload } from '../../scripts/bridge-api.mjs';
import { mfaBootLine } from '../../scripts/bridge-account-mfa-state.mjs';
import { newSecret, sealSecret } from '../../scripts/bridge-account-mfa-totp.mjs';
import { signAppSessionToken, verifyAppSessionToken } from '../../scripts/bridge-session-token.mjs';
import { MFA_KEY, noFactorPg, startMfaWorld, verifiedRow } from './support/mfa-world.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { refreshWith, tokenClaims } from './support/session-signin.mjs';
import { USER_A, USER_B, sessionConfig } from './support/session-world.mjs';

const sealed = (userId = USER_A) => sealSecret(newSecret(), userId, { OSIONOS_MFA_SECRET_KEY: MFA_KEY });
const enrolled = (userId = USER_A) => ({ totp: [verifiedRow(userId, sealed(userId))] });
const pending = { totp: [{ user_id: USER_A, secret_enc: sealed(), status: 'pending', last_step: 0, created_at: '2026-10-01T00:00:00.000Z' }] };

describe('two-step verification: the claims minted at sign-in', () => {
	it('mints aal 1 and mfa_req for a user with a verified factor, on the handoff path', async (t) => {
		const world = await startMfaWorld(t, enrolled());
		const { claims, answer } = await world.signIn();
		assert.equal(claims.aal, 1);
		assert.equal(claims.mfa_req, true);
		assert.equal(answer.body.session.mfaRequired, true);
	});

	it('mints the same gated token on the password path and answers mfaRequired at the top level', async (t) => {
		const world = await startMfaWorld(t, enrolled());
		const answer = await world.login();
		assert.equal(answer.status, 200, answer.text);
		assert.equal(answer.body.mfaRequired, true);
		assert.equal(answer.body.session.mfaRequired, true);
		assert.deepEqual([tokenClaims(answer.body.accessToken).aal, tokenClaims(answer.body.accessToken).mfa_req], [1, true]);
	});

	it('mints the same gated token on the exchange path', async (t) => {
		const world = await startMfaWorld(t, enrolled());
		const answer = await world.exchange();
		assert.equal(answer.status, 200, answer.text);
		assert.deepEqual([tokenClaims(answer.body.accessToken).aal, tokenClaims(answer.body.accessToken).mfa_req], [1, true]);
	});

	for (const [name, rows] of [['no factor', {}], ['only a pending factor', pending], ['a factor of someone else', enrolled(USER_B)]]) {
		it(`mints a token with neither claim for ${name}`, async (t) => {
			const world = await startMfaWorld(t, rows);
			const { claims, answer, accessToken } = await world.signIn();
			assert.equal(claims.aal, undefined);
			assert.equal(claims.mfa_req, undefined);
			assert.equal(answer.body.session.mfaRequired, undefined);
			const verified = verifyAppSessionToken(accessToken, world.config);
			assert.deepEqual([verified.aal, verified.mfaPending], [2, false]);
			assert.equal((await world.api('GET', '/api/account/sessions', accessToken)).status, 200);
		});
	}

	it('keeps a token signed without the new options byte-identical to one signed before them', () => {
		const config = sessionConfig();
		const args = { payload: { subject: USER_A, provider: 'prismatica' }, workspace: { _id: USER_A }, config, now: 1_800_000_000_000, jti: 'j1' };
		const plain = signAppSessionToken(args).token;
		assert.equal(signAppSessionToken({ ...args, aal: undefined, mfaReq: undefined }).token, plain);
		const gated = tokenClaims(signAppSessionToken({ ...args, aal: 1, mfaReq: true }).token);
		assert.deepEqual([gated.aal, gated.mfa_req], [1, true]);
	});
});

describe('two-step verification: what an aal1 token may do', () => {
	const refused = [['GET', '/api/account/sessions'], ['GET', `/api/pages/all?workspaceId=${USER_A}`], ['POST', '/api/workspaces'], ['POST', '/api/account/2fa/enroll'], ['POST', '/api/account/2fa/disable']];
	for (const [method, path] of refused) {
		it(`answers 403 mfa_required on ${method} ${path}`, async (t) => {
			const world = await startMfaWorld(t, enrolled());
			const { accessToken } = await world.signIn();
			const answer = await world.api(method, path, accessToken, { body: method === 'POST' ? {} : undefined });
			assert.equal(answer.status, 403, answer.text);
			assert.equal(answer.body.code, 'mfa_required');
		});
	}

	it('still reaches the status route and sign-out, the two things a pending session needs', async (t) => {
		const world = await startMfaWorld(t, enrolled());
		const { accessToken } = await world.signIn();
		const status = await world.api('GET', '/api/account/2fa/status', accessToken);
		assert.deepEqual(status.body, { enabled: true, methods: ['totp'], recoveryRemaining: 0, aal: 1 });
		assert.equal((await world.api('POST', '/api/auth/bridge/logout', accessToken)).status, 204);
	});

	it('throws from the verifier unless the caller opts in, and reports the pending state when it does', () => {
		const config = sessionConfig();
		const { token } = signAppSessionToken({ payload: { subject: USER_A, provider: 'prismatica' }, workspace: { _id: USER_A }, config, aal: 1, mfaReq: true });
		assert.throws(() => verifyAppSessionToken(token, config), (error) => error.status === 403 && error.code === 'mfa_required');
		const verified = verifyAppSessionToken(token, config, undefined, { allowPendingMfa: true });
		assert.deepEqual([verified.aal, verified.mfaPending], [1, true]);
	});

	it('does not let a refresh turn an aal1 family into aal2', async (t) => {
		const world = await startMfaWorld(t, enrolled());
		const { refreshToken } = await world.signIn();
		const refreshed = await refreshWith(world.base, refreshToken);
		assert.equal(refreshed.status, 200, refreshed.text);
		const claims = tokenClaims(refreshed.body.accessToken);
		assert.deepEqual([claims.aal, claims.mfa_req], [1, true]);
	});

	it('leaves the refresh of an ungated family without either claim', async (t) => {
		const world = await startMfaWorld(t);
		const { refreshToken } = await world.signIn();
		const claims = tokenClaims((await refreshWith(world.base, refreshToken)).body.accessToken);
		assert.deepEqual([claims.aal, claims.mfa_req], [undefined, undefined]);
	});
});

describe('two-step verification: the lookup fails closed', () => {
	const failures = [
		['a missing relation (PGRST205)', { status: 404, body: { code: 'PGRST205', message: 'Could not find the table' } }],
		['a missing relation (42P01)', { status: 404, body: { code: '42P01', message: 'relation does not exist' } }],
		['a server error', { status: 500, body: { message: 'boom' } }],
		['a gateway timeout', { status: 504, body: {} }],
	];
	for (const [name, failure] of failures) {
		it(`refuses to mint on ${name}`, async (t) => {
			const world = await startMfaWorld(t);
			world.mfa.failRead = failure;
			const answer = await world.mintRaw();
			assert.equal(answer.status, 503, answer.text);
			assert.equal(answer.body.code, 'mfa_unavailable');
			assert.equal(world.kv.keys().filter((key) => key.includes('handoff:')).length, 0, 'no handoff was stored');
		});
	}

	const payload = validateBridgePayload({ provider: 'prismatica', subject: USER_A, email: 'member@example.com', name: 'Member', jti: '6f1d0c1e-2b3a-4c5d-8e9f-0a1b2c3d4e5f' });
	it('refuses to mint when the gate is available and no pg is given', async () => {
		await assert.rejects(createBridgeHandoff({ payload, config: sessionConfig(), kv: kvStub(), fetchImpl: async () => new Response('[]') }), (error) => error.status === 503 && error.code === 'mfa_unavailable');
	});

	it('mints aal2 and says the gate is off when the bridge has no BaaS to ask', async () => {
		const config = { ...sessionConfig(), baasUrl: '', serviceKey: '' };
		const handoff = await createBridgeHandoff({ payload, config, kv: kvStub(), fetchImpl: async () => new Response('[]') });
		assert.ok(handoff.redirectUrl);
		assert.match(mfaBootLine(config), /mfa_gate=off/);
	});

	it('mints for a user whose lookup answers an empty list', async () => {
		const handoff = await createBridgeHandoff({ payload, config: sessionConfig(), kv: kvStub(), pg: noFactorPg(), fetchImpl: async () => new Response('[]') });
		assert.ok(handoff.redirectUrl);
		assert.match(mfaBootLine(sessionConfig()), /mfa_gate=on/);
	});
});

describe('two-step verification: the mint is not scattered', () => {
	it('signs an app session token in exactly the three places that know about the gate', () => {
		const dir = new URL('../../scripts/', import.meta.url);
		const callers = readdirSync(dir).filter((name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs') && name !== 'db-isolation-suite.mjs')
			.filter((name) => /(?<![\w.])signAppSessionToken\(/.test(readFileSync(new URL(name, dir), 'utf8').replace(/export function signAppSessionToken\(/, '')))
			.sort();
		assert.deepEqual(callers, ['bridge-account-mfa-state.mjs', 'bridge-api.mjs', 'bridge-sessions.mjs']);
	});

	it('creates a user session in one production place only', () => {
		const text = readFileSync(new URL('../../scripts/bridge-api.mjs', import.meta.url), 'utf8');
		assert.equal(text.match(/(?<![\w.])createUserSession\(/g).length, 2, 'the definition and the one call in createBridgeHandoff');
	});
});


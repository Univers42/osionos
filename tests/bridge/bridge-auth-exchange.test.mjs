/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-auth-exchange.test.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * POST /api/auth/exchange: a GoTrue access token earned by a passwordless sign-in becomes an
 * osionos session. The proof is the verified `amr` claim and the token's age, never the body.
 * The neighbours (GoTrue, the gateway) are scripted by support/auth-world.mjs, which injects
 * fetchImpl, kv and pg the way bridge-account-sudo.test.mjs does.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clientIpBootWarning } from '../../scripts/bridge-auth-exchange.mjs';
import { gotrueJwt, startAuthWorld, USER_ID } from './support/auth-world.mjs';

const PATH = '/api/auth/exchange';
const nowSeconds = () => Math.floor(Date.now() / 1000);
const unauthorized = () => new Response('{"msg":"bad jwt"}', { status: 401 });
const gatewayReply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function exchange(t, accessToken, options) {
	const world = await startAuthWorld(t, options);
	return { world, response: await world.post(PATH, { accessToken }) };
}

describe('POST /api/auth/exchange, the accepted proofs', () => {
	it('turns a fresh email-OTP token into a session recorded as email_otp, with the bridge refresh token and no GoTrue one', async (t) => {
		const token = gotrueJwt();
		const { world, response } = await exchange(t, token);
		assert.equal(response.status, 200);
		assert.equal(response.headers.get('cache-control'), 'no-store');
		assert.equal(response.body.user.id, USER_ID);
		assert.match(response.body.refreshToken, /^osb_rt\./);
		assert.equal(response.body.refreshToken, response.body.session.refreshToken);
		assert.match(response.body.accessToken, /^osionos_v1\./);
		assert.ok(Array.isArray(response.body.workspaceIds));
		assert.equal(response.body.session.userId, USER_ID);
		assert.equal(world.rows.sessions.length, 1);
		assert.equal(world.rows.sessions[0].auth_method, 'email_otp');
		assert.equal(world.calls.gotrue[0].token, token);
		assert.equal(world.calls.gotrue[0].headers.apikey, 'public-anon-test-key');
		assert.equal(world.calls.gateway.length, 1);
		assert.equal(world.calls.gateway[0].route, '/api/auth/osionos-session');
		assert.equal(world.calls.gateway[0].headers.authorization, `Bearer ${token}`);
	});

	it('records an OAuth token as oauth', async (t) => {
		const iat = nowSeconds();
		const { world, response } = await exchange(t, gotrueJwt({ iat, amr: [{ method: 'oauth', timestamp: iat }] }));
		assert.equal(response.status, 200);
		assert.equal(world.rows.sessions[0].auth_method, 'oauth');
	});

	it('reads the most recent amr entry by timestamp, wherever it sits in the array', async (t) => {
		const iat = nowSeconds();
		const amr = [{ method: 'otp', timestamp: iat }, { method: 'password', timestamp: iat - 3000 }];
		const { response } = await exchange(t, gotrueJwt({ iat, amr }));
		assert.equal(response.status, 200);
	});

	it('accepts a token 290 s old', async (t) => {
		const iat = nowSeconds() - 290;
		const { response } = await exchange(t, gotrueJwt({ iat }));
		assert.equal(response.status, 200);
	});
});

describe('POST /api/auth/exchange, the refused proofs', () => {
	async function refused(t, token, options) {
		const { world, response } = await exchange(t, token, options);
		assert.equal(response.status, 401, response.text);
		assert.equal(response.body.code, 'invalid_provider_token');
		assert.equal(response.headers.get('cache-control'), 'no-store');
		assert.deepEqual(world.calls.gateway, []);
		assert.deepEqual(world.rows.sessions, []);
		return world;
	}

	it('refuses a token GoTrue does not accept', async (t) => {
		await refused(t, gotrueJwt(), { gotrue: unauthorized });
	});

	it('refuses a password token: the GoTrue password grant is public on Kong and skips Turnstile', async (t) => {
		const iat = nowSeconds();
		await refused(t, gotrueJwt({ iat, amr: [{ method: 'password', timestamp: iat }] }));
	});

	it('refuses a token whose most recent method is token_refresh, even after an OTP', async (t) => {
		const iat = nowSeconds();
		await refused(t, gotrueJwt({ iat, amr: [{ method: 'otp', timestamp: iat - 100 }, { method: 'token_refresh', timestamp: iat }] }));
	});

	it('refuses a tie at the newest timestamp between password and otp, in either order', async (t) => {
		const iat = nowSeconds();
		await refused(t, gotrueJwt({ iat, amr: [{ method: 'otp', timestamp: iat }, { method: 'password', timestamp: iat }] }));
		await refused(t, gotrueJwt({ iat, amr: [{ method: 'password', timestamp: iat }, { method: 'otp', timestamp: iat }] }));
	});

	it('refuses other methods (recovery, magiclink, totp, sso/saml)', async (t) => {
		const iat = nowSeconds();
		for (const method of ['recovery', 'magiclink', 'totp', 'sso/saml']) {
			await refused(t, gotrueJwt({ iat, amr: [{ method, timestamp: iat }] }));
		}
	});

	it('refuses a token older than 300 s, however good its method', async (t) => {
		await refused(t, gotrueJwt({ iat: nowSeconds() - 310 }));
	});

	it('refuses a token issued in the future', async (t) => {
		await refused(t, gotrueJwt({ iat: nowSeconds() + 3600 }));
	});

	it('refuses a token with no amr, a malformed amr, or no readable payload', async (t) => {
		const iat = nowSeconds();
		await refused(t, gotrueJwt({ iat, amr: undefined }));
		await refused(t, gotrueJwt({ iat, amr: 'otp' }));
		await refused(t, gotrueJwt({ iat, amr: [{ method: 'otp' }] }));
		await refused(t, gotrueJwt({ iat, amr: [] }));
		await refused(t, 'not-a-jwt');
	});

	it('refuses a token whose subject is not the user GoTrue answered for', async (t) => {
		await refused(t, gotrueJwt({ sub: '11111111-1111-4111-8111-111111111111' }));
	});

	it('refuses when the session the gateway minted belongs to someone else', async (t) => {
		const { response, world } = await exchange(t, gotrueJwt(), { subject: '22222222-2222-4222-8222-222222222222' });
		assert.equal(response.status, 401);
		assert.equal(response.body.code, 'invalid_provider_token');
		assert.deepEqual(world.rows.sessions, []);
	});
});

describe('POST /api/auth/exchange, the gateway refusal', () => {
	it('keeps the gateway 409 sign-in-method collision instead of answering 502', async (t) => {
		const world = await startAuthWorld(t, {
			gateway: ({ route }) => (route === '/api/auth/osionos-session'
				? gatewayReply({ error: 'oauth_email_collision', message: 'This email is already linked to another sign-in method.' }, 409)
				: undefined),
		});
		const response = await world.post(PATH, { accessToken: gotrueJwt() });
		assert.equal(response.status, 409);
		assert.equal(response.body.code, 'oauth_email_collision');
		assert.equal(response.body.message, 'This email is already linked to another sign-in method.');
	});
});

describe('POST /api/auth/exchange, the body', () => {
	it('never lets the client name the sign-in method: any other key is a 422 and nothing is minted', async (t) => {
		const world = await startAuthWorld(t);
		const response = await world.post(PATH, { accessToken: gotrueJwt(), authMethod: 'oauth' });
		assert.equal(response.status, 422);
		assert.equal(response.body.code, 'invalid_exchange_request');
		assert.deepEqual(world.calls.gotrue, []);
		assert.deepEqual(world.rows.sessions, []);
	});

	it('records the method of the proof, not the one a client would like', async (t) => {
		const world = await startAuthWorld(t);
		await world.post(PATH, { accessToken: gotrueJwt(), authMethod: 'oauth' });
		const ok = await world.post(PATH, { accessToken: gotrueJwt() });
		assert.equal(ok.status, 200);
		assert.equal(world.rows.sessions.map((row) => row.auth_method).join(), 'email_otp');
	});

	it('refuses a missing, empty, non-string or array body', async (t) => {
		const world = await startAuthWorld(t);
		for (const body of [{}, { accessToken: '' }, { accessToken: 42 }, { accessToken: ['a'] }, [{ accessToken: 'a' }], null]) {
			const response = await world.post(PATH, body);
			assert.equal(response.status, 422, JSON.stringify(body));
			assert.equal(response.body.code, 'invalid_exchange_request');
		}
		assert.deepEqual(world.calls.gotrue, []);
	});

	it('caps the body at 4096 characters and refuses malformed JSON', async (t) => {
		const world = await startAuthWorld(t);
		const big = await world.post(PATH, { accessToken: 'a'.repeat(4100) });
		assert.equal(big.status, 413);
		const bad = await world.post(PATH, '{"accessToken":');
		assert.equal(bad.status, 400);
		assert.deepEqual(world.calls.gotrue, []);
	});

	it('answers 503 exchange_unconfigured when the public api key is missing', async (t) => {
		const world = await startAuthWorld(t, { env: { PUBLIC_BAAS_ANON_KEY: '', KONG_PUBLIC_API_KEY: '' } });
		const response = await world.post(PATH, { accessToken: gotrueJwt() });
		assert.equal(response.status, 503);
		assert.equal(response.body.code, 'exchange_unconfigured');
	});
});

describe('POST /api/auth/exchange, limits and audit', () => {
	it('answers 429 on the 21st call from one address', async (t) => {
		const world = await startAuthWorld(t, { gotrue: unauthorized });
		const statuses = [];
		for (let call = 0; call < 21; call += 1) statuses.push((await world.post(PATH, { accessToken: gotrueJwt() })).status);
		assert.deepEqual(statuses.slice(0, 20), Array(20).fill(401));
		assert.equal(statuses[20], 429);
	});

	it('answers 429 on the 11th call for one GoTrue user', async (t) => {
		const iat = nowSeconds();
		const world = await startAuthWorld(t);
		const statuses = [];
		for (let call = 0; call < 11; call += 1) {
			statuses.push((await world.post(PATH, { accessToken: gotrueJwt({ iat, amr: [{ method: 'password', timestamp: iat }] }) })).status);
		}
		assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
		assert.equal(statuses[10], 429);
	});

	it('spends a token on its first exchange: the second is a 401', async (t) => {
		const token = gotrueJwt();
		const world = await startAuthWorld(t);
		assert.equal((await world.post(PATH, { accessToken: token })).status, 200);
		const second = await world.post(PATH, { accessToken: token });
		assert.equal(second.status, 401);
		assert.equal(second.body.code, 'invalid_provider_token');
		assert.equal(world.rows.sessions.length, 1);
	});

	it('audits refusals once GoTrue named the user, and no audit row holds the token', async (t) => {
		const iat = nowSeconds();
		const world = await startAuthWorld(t);
		const tokens = [
			gotrueJwt({ iat, amr: [{ method: 'password', timestamp: iat }] }),
			gotrueJwt({ iat: iat - 600 }),
		];
		for (const accessToken of tokens) await world.post(PATH, { accessToken });
		assert.equal(world.rows.audit.length, 2);
		assert.ok(world.rows.audit.every((row) => row.event_type === 'auth.exchange_refused' && row.subject === USER_ID));
		assert.deepEqual(world.rows.audit.map((row) => row.details.reason), ['invalid_provider_token', 'invalid_provider_token']);
		const dump = JSON.stringify(world.rows.audit);
		for (const token of tokens) assert.ok(!dump.includes(token) && !dump.includes(token.split('.')[1]));
	});

	it('writes no audit row for an anonymous caller: bad body, unknown token, or a rate-limited flood', async (t) => {
		const world = await startAuthWorld(t, { gotrue: unauthorized });
		await world.post(PATH, { accessToken: gotrueJwt(), authMethod: 'oauth' });
		for (let call = 0; call < 30; call += 1) await world.post(PATH, { accessToken: gotrueJwt() });
		assert.deepEqual(world.rows.audit, []);
	});

	it('writes no audit row for a 429, only for the refusals before it', async (t) => {
		const iat = nowSeconds();
		const world = await startAuthWorld(t);
		for (let call = 0; call < 30; call += 1) {
			await world.post(PATH, { accessToken: gotrueJwt({ iat, amr: [{ method: 'password', timestamp: iat }], extra: { n: call } }) });
		}
		assert.equal(world.rows.audit.length, 10);
	});

	it('warns at boot when no client address header is configured', () => {
		assert.match(clientIpBootWarning({ clientIpHeader: '' }), /CLIENT_IP_HEADER/);
		assert.equal(clientIpBootWarning({ clientIpHeader: 'x-real-ip' }), '');
	});

	it('still answers the refusal when the audit write fails, and logs that without the token', async (t) => {
		const warned = [];
		t.mock.method(console, 'warn', (...args) => warned.push(args.join(' ')));
		const ours = () => warned.filter((line) => line.includes('auth exchange'));
		const iat = nowSeconds();
		const token = gotrueJwt({ iat, amr: [{ method: 'password', timestamp: iat }] });
		const world = await startAuthWorld(t, { failAudit: true });
		const response = await world.post(PATH, { accessToken: token });
		assert.equal(response.status, 401);
		assert.equal(response.body.code, 'invalid_provider_token');
		assert.equal(ours().length, 1);
		assert.ok(!warned.join('\n').includes(token));
	});
});

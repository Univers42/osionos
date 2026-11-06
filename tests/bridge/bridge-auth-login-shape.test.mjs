/**
 * The two /api/auth/login answers are two contracts, not one path answered twice (#241):
 * the bridge (:10000) returns the app session below; the prismatica auth gateway behind
 * :8443 returns GoTrue's token shape, pinned in prismatica tests/unit/auth/gateway-login-otp.
 * The bridge calls the gateway itself and converts its answer; these keys are what the app reads.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startAuthWorld } from './support/auth-world.mjs';

const CREDENTIALS = { email: 'ada@example.com', password: 'correct horse battery' };

describe('POST /api/auth/login on the bridge', () => {
	it('answers the app session, camelCase, never the gateway token shape', async (t) => {
		const world = await startAuthWorld(t);
		const response = await world.post('/api/auth/login', CREDENTIALS);
		assert.equal(response.status, 200);
		assert.deepEqual(Object.keys(response.body).sort(), ['accessToken', 'expiresAt', 'refreshToken', 'session', 'user', 'workspaceIds']);
		for (const gatewayKey of ['access_token', 'refresh_token', 'token_type', 'expires_in', 'expires_at', 'weak_password']) {
			assert.equal(gatewayKey in response.body, false, gatewayKey);
		}
		assert.equal(typeof response.body.accessToken, 'string');
		assert.equal(response.body.user.email, CREDENTIALS.email);
		assert.ok(Array.isArray(response.body.workspaceIds));
	});

	it('calls the gateway login and does not pass its token through', async (t) => {
		const world = await startAuthWorld(t);
		const response = await world.post('/api/auth/login', CREDENTIALS);
		const login = world.calls.gateway.find((call) => call.route === '/api/auth/login');
		assert.ok(login, 'the bridge asked the gateway');
		assert.notEqual(response.body.accessToken, undefined);
		assert.equal(JSON.stringify(response.body).includes('"access_token"'), false);
	});
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-identities.test.mjs                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Linked sign-in identities (P3-1-c, read-only): the route reads GoTrue admin with the
 * session's own id and answers only the allowlisted fields. Driven without a socket
 * against a recording fake of fetch.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountIdentitiesRoutes } from '../../scripts/bridge-account-identities.mjs';
import { callRoute } from './support/route-call.mjs';
import { accountConfig, USER_A, USER_B } from './support/account-world.mjs';

const PATH = '/api/account/identities';
const RAW_IDENTITY = {
	identity_id: 'iiiiiiii-1111-4111-8111-iiiiiiiiiiii',
	id: 'google-subject-1',
	user_id: USER_A,
	provider: 'google',
	email: 'member@example.com',
	created_at: '2026-09-01T00:00:00Z',
	last_sign_in_at: '2026-10-20T00:00:00Z',
	identity_data: { email: 'member@example.com', access_token: 'LEAK-1', avatar_url: 'LEAK-2' },
	access_token: 'LEAK-3',
	refresh_token: 'LEAK-4',
};

function build({ gotrue = () => ({ status: 200, body: { id: USER_A, identities: [RAW_IDENTITY], app_metadata: { secret: 'LEAK-5' }, encrypted_password: 'LEAK-6' } }), session = { userId: USER_A, jti: 'j' }, config = accountConfig() } = {}) {
	const calls = [];
	const fetchImpl = async (url, init) => {
		calls.push({ url: String(url), init });
		const answer = gotrue();
		if (answer instanceof Error) throw answer;
		return { ok: answer.status < 300, status: answer.status, json: async () => answer.body };
	};
	const verifySession = () => {
		if (!session) throw Object.assign(new Error('An app session is required.'), { status: 401 });
		return session;
	};
	const handler = createAccountIdentitiesRoutes({ config, verifySession, fetchImpl });
	return { calls, call: (options) => callRoute(handler, options) };
}

describe('GET /api/account/identities', () => {
	it('projects each identity to the allowlist and leaks nothing else', async () => {
		const { call } = build();
		const result = await call({ method: 'GET', path: PATH });
		assert.equal(result.status, 200);
		assert.deepEqual(result.body, { identities: [{ provider: 'google', identityId: RAW_IDENTITY.identity_id, email: 'member@example.com', linkedAt: '2026-09-01T00:00:00Z', lastSignInAt: '2026-10-20T00:00:00Z' }] });
		assert.doesNotMatch(result.text, /LEAK|identity_data|access_token|encrypted_password|app_metadata/);
	});

	it('answers an empty list for a user with no identities', async () => {
		const { call } = build({ gotrue: () => ({ status: 200, body: { id: USER_A } }) });
		assert.deepEqual((await call({ method: 'GET', path: PATH })).body, { identities: [] });
	});

	it('answers 401 without a session and never calls GoTrue', async () => {
		const { call, calls } = build({ session: null });
		const result = await call({ method: 'GET', path: PATH });
		assert.equal(result.status, 401);
		assert.equal(calls.length, 0);
	});

	it('reads the session user with the service key, whatever the query string says', async () => {
		const { call, calls } = build();
		await call({ method: 'GET', path: `${PATH}?userId=${USER_B}&user_id=${USER_B}`, headers: { 'x-user-id': USER_B } });
		assert.equal(calls.length, 1);
		assert.equal(calls[0].url, `https://baas.local/auth/v1/admin/users/${USER_A}`);
		assert.equal(calls[0].init.headers.Authorization, 'Bearer service-role-test-key');
		assert.equal(calls[0].init.headers.apikey, 'service-role-test-key');
	});

	it('answers 503 account_plane_unavailable when GoTrue fails, answers 5xx, or the plane is unconfigured', async () => {
		const failures = [
			build({ gotrue: () => new Error('connection refused') }),
			build({ gotrue: () => ({ status: 500, body: {} }) }),
			build({ config: { ...accountConfig(), serviceKey: '' } }),
		];
		for (const { call } of failures) {
			const result = await call({ method: 'GET', path: PATH });
			assert.equal(result.status, 503);
			assert.equal(result.body.code, 'account_plane_unavailable');
		}
	});
});

describe('the GoTrue read behind the route', () => {
	it('answers 503 account_plane_unavailable on an upstream 500 and when fetch throws', async () => {
		for (const gotrue of [() => ({ status: 500, body: {} }), () => new Error('connection refused')]) {
			const result = await build({ gotrue }).call({ method: 'GET', path: PATH });
			assert.equal(result.status, 503);
			assert.equal(result.body.code, 'account_plane_unavailable');
		}
	});

	it('makes no fetch when the service key is unset', async () => {
		const { call, calls } = build({ config: { ...accountConfig(), serviceKey: '' } });
		const result = await call({ method: 'GET', path: PATH });
		assert.equal(result.status, 503);
		assert.equal(result.body.code, 'account_plane_unavailable');
		assert.equal(calls.length, 0);
	});

	it('sends the encoded id with the service key as apikey and bearer', async () => {
		const { call, calls } = build({ session: { userId: 'a/b c', jti: 'j' } });
		await call({ method: 'GET', path: PATH });
		assert.equal(calls[0].url, 'https://baas.local/auth/v1/admin/users/a%2Fb%20c');
		assert.equal(calls[0].init.headers.apikey, 'service-role-test-key');
		assert.equal(calls[0].init.headers.Authorization, 'Bearer service-role-test-key');
	});
});

describe('other verbs and paths', () => {
	it('answers 405 to every verb but GET, and to any sub-path, before any GoTrue call', async () => {
		const { call, calls } = build();
		for (const [method, path] of [['DELETE', `${PATH}/google`], ['DELETE', PATH], ['POST', PATH], ['PUT', PATH], ['PATCH', PATH], ['GET', `${PATH}/google`]]) {
			const result = await call({ method, path });
			assert.equal(result.status, 405, `${method} ${path}`);
			assert.equal(result.body.code, 'method_not_allowed');
		}
		assert.equal(calls.length, 0);
	});

	it('leaves unrelated paths to the other modules', async () => {
		const { call } = build();
		assert.equal((await call({ method: 'GET', path: '/api/account/identity' })).handled, false);
		assert.equal((await call({ method: 'GET', path: '/api/account/identitiesx' })).handled, false);
	});
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-gateway-session-errors.test.mjs             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configFromEnv, createBridgeHandoff, createBridgeServer, validateBridgePayload } from '../../scripts/bridge-api.mjs';
import { kvStub } from './support/kv-stub.mjs';

const GATEWAY = 'http://gateway.local';

function config() {
	return configFromEnv({
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_BRIDGE_SHARED_SECRET: 'test-bridge-secret-that-is-long-enough',
		OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
		OSIONOS_BRIDGE_PERSISTENCE: 'memory',
		OSIONOS_BAAS_URL: '',
		AUTH_GATEWAY_URL: GATEWAY,
		// The local sign-in has no Turnstile widget; without the bypass the bridge refuses a token-less request.
	});
}

function reply(body, status = 200, headers = {}) {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

// The gateway stub answers login with a token, then scripts the osionos-session answer under test.
async function signIn(sessionAnswer) {
	const cfg = config();
	const kv = kvStub();
	const handoff = await createBridgeHandoff({
		payload: validateBridgePayload({ provider: 'prismatica', subject: randomUUID(), email: 'a@example.com', name: 'A', jti: randomUUID() }),
		config: cfg, kv,
	});
	const fetchImpl = async (url) => {
		const route = String(url).replace(GATEWAY, '');
		if (route === '/api/auth/login') return reply({ access_token: 'gw-token', refresh_token: 'r', user: { id: randomUUID() } });
		return sessionAnswer(handoff);
	};
	const server = createBridgeServer({ config: cfg, kv, fetchImpl });
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	try {
		const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: 'a@example.com', password: 'correct horse battery' }),
		});
		const text = await response.text();
		return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
	} finally {
		await new Promise((done) => server.close(done));
	}
}

describe('the bridge keeps the auth gateway\'s app-session refusals', () => {
	it('passes a 409 email collision through with its code and message', async () => {
		const { status, body } = await signIn(() => reply({
			error: 'oauth_email_collision',
			message: 'This email is already linked to another sign-in method.',
		}, 409));
		assert.equal(status, 409);
		assert.equal(body.code, 'oauth_email_collision');
		assert.equal(body.message, 'This email is already linked to another sign-in method.');
	});

	it('passes a 429 rate limit through with its code and retry-after', async () => {
		const { status, headers, body } = await signIn(() => reply({
			error: 'rate_limited',
			message: 'Too many attempts. Please retry later.',
		}, 429, { 'retry-after': '17' }));
		assert.equal(status, 429);
		assert.equal(body.code, 'rate_limited');
		assert.equal(headers.get('retry-after'), '17');
	});

	it('passes a 429 through without inventing a retry-after', async () => {
		const { status, headers } = await signIn(() => reply({
			error: 'rate_limited',
			message: 'Too many attempts. Please retry later.',
		}, 429));
		assert.equal(status, 429);
		assert.equal(headers.get('retry-after'), null);
	});

	it('still answers 502 when the gateway has no identity available', async () => {
		const { status } = await signIn(() => reply({
			error: 'oauth_identity_unavailable',
			message: 'The sign-in service could not confirm your identity.',
		}, 503));
		assert.equal(status, 502);
	});

	it('still answers 502 for a 500 with an empty body', async () => {
		const { status, body } = await signIn(() => new Response('', { status: 500 }));
		assert.equal(status, 502);
		assert.equal(body.message, 'Could not establish the app session.');
	});

	it('still answers 502 for a 200 that carries no redirectUrl', async () => {
		const { status } = await signIn(() => reply({ ok: true }));
		assert.equal(status, 502);
	});
});

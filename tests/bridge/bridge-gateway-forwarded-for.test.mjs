/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-gateway-forwarded-for.test.mjs              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configFromEnv, createBridgeHandoff, createBridgeServer, validateBridgePayload } from '../../scripts/bridge-api.mjs';

const GATEWAY = 'http://gateway.local';

function config() {
	return configFromEnv({
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_BRIDGE_SHARED_SECRET: 'test-bridge-secret-that-is-long-enough',
		OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
		OSIONOS_BRIDGE_PERSISTENCE: 'memory',
		AUTH_GATEWAY_URL: GATEWAY,
	});
}

function reply(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// A gateway stub that records each call, and answers the sign-in flow end to end.
async function signIn(path, forwardedHeader) {
	const cfg = config();
	const handoffStore = new Map();
	const handoff = await createBridgeHandoff({
		payload: validateBridgePayload({ provider: 'prismatica', subject: randomUUID(), email: 'a@example.com', name: 'A', jti: randomUUID() }),
		config: cfg, handoffStore,
	});
	const seen = [];
	const fetchImpl = async (url, init = {}) => {
		const route = String(url).replace(GATEWAY, '');
		seen.push({ route, forwardedFor: init.headers?.['x-forwarded-for'] });
		if (route === '/api/auth/register') return reply({ ok: true });
		if (route === '/api/auth/login') return reply({ access_token: 'gw-token', refresh_token: 'r', user: { id: randomUUID() } });
		return reply({ redirectUrl: handoff.redirectUrl });
	};
	const server = createBridgeServer({ config: cfg, handoffStore, fetchImpl });
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	try {
		const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...(forwardedHeader ? { 'x-forwarded-for': forwardedHeader } : {}) },
			body: JSON.stringify({ email: 'a@example.com', password: 'correct horse battery' }),
		});
		await response.text();
		return { status: response.status, seen };
	} finally {
		await new Promise((done) => server.close(done));
	}
}

describe('bridge calls to the auth gateway forward the client address', () => {
	it('appends the socket peer to the incoming x-forwarded-for on every call', async () => {
		const { status, seen } = await signIn('/api/auth/login', '203.0.113.9');
		assert.equal(status, 200);
		assert.deepEqual(seen.map((call) => call.route), ['/api/auth/login', '/api/auth/osionos-session']);
		for (const call of seen) assert.equal(call.forwardedFor, '203.0.113.9, 127.0.0.1');
	});

	it('sends just the peer when the caller sent no x-forwarded-for', async () => {
		const { seen } = await signIn('/api/auth/login');
		for (const call of seen) assert.equal(call.forwardedFor, '127.0.0.1');
	});

	it('forwards on register too', async () => {
		const { seen } = await signIn('/api/auth/register', '198.51.100.4');
		assert.equal(seen[0].route, '/api/auth/register');
		for (const call of seen) assert.equal(call.forwardedFor, '198.51.100.4, 127.0.0.1');
	});
});

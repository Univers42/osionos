/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   session-world.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The world of the session rows: a bridge with the account plane on, the PostgREST that
 * answers it, and the two requests that write a row (the handoff consume and the password
 * sign-in). The clock is a value, so a test can move it past a handoff expiry.
 */

import { bridgeSignature, configFromEnv, createBridgeServer, validateBridgePayload } from '../../../scripts/bridge-api.mjs';
import { SessionCutoffs } from '../../../scripts/bridge-session-cutoff.mjs';
import { createSessionStore } from './session-postgrest.mjs';

export const APP_SECRET = 'test-app-session-secret-that-is-long-enough';
export const SHARED_SECRET = 'test-bridge-secret-that-is-long-enough';
export const JWT_SECRET = 'account-jwt-test-secret';
export const USER_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
export const USER_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

export function sessionConfig({ records = 'on', serviceKey = 'service-role-test-key', ipHeader = '', now, persistence = 'memory' } = {}) {
	const config = configFromEnv({
		OSIONOS_SESSION_CUTOFFS: 'off',
		OSIONOS_SESSION_RECORDS: records,
		OSIONOS_BRIDGE_PERSISTENCE: persistence,
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_BRIDGE_SHARED_SECRET: SHARED_SECRET,
		OSIONOS_APP_SESSION_SECRET: APP_SECRET,
		OSIONOS_BAAS_URL: 'http://baas.local',
		KONG_SERVICE_API_KEY: serviceKey,
		OSIONOS_BRIDGE_CLIENT_IP_HEADER: ipHeader,
		OSIONOS_BRIDGE_IP_HASH_SECRET: 'ip-hash-secret',
	});
	// The cut-offs stay off (they are their own suite), but the tracker carries the clock:
	// the token verifier reads the time from it.
	config.sessionCutoffs = new SessionCutoffs({ enforced: false, offReason: 'test', now: now ?? (() => Date.now()) });
	return config;
}

/** A bridge, the PostgREST behind it and the store it writes to. */
export async function startSessionBridge({ config, rows = [], fail = null, kv, clock, t, store } = {}) {
	const backing = store ?? createSessionStore({ rows, fail });
	const server = createBridgeServer({
		config: config ?? sessionConfig({ now: clock ? () => clock.at : undefined }),
		fetchImpl: backing.fetchImpl,
		kv,
		env: { JWT_SECRET },
		now: clock ? () => clock.at : undefined,
	});
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	t?.after(() => new Promise((done) => server.close(done)));
	await untilTheRevocationTableWasRead(server);
	return { server, store: backing, base: `http://127.0.0.1:${server.address().port}` };
}

/**
 * The revocation set is polled in the background: a test that checks a token before the
 * first poll would read a bridge that answers 503. Waiting for the first attempt (loaded
 * or failed) makes the state the test sees deterministic.
 */
async function untilTheRevocationTableWasRead(server) {
	const tracker = server.sessionRevocations;
	if (!tracker.enforced) return;
	for (let attempt = 0; attempt < 300; attempt += 1) {
		if (tracker.loadedAt !== null || tracker.failureStreak !== null) return;
		await new Promise((done) => setTimeout(done, 5));
	}
	throw new Error('the revocation tracker never read its table');
}

/** The gateway's signed request: the HMAC is over the normalized payload. */
export function gatewayRequest(payload, { timestamp, secret = SHARED_SECRET, badSignature = false } = {}) {
	const normalized = validateBridgePayload(payload);
	const stamp = String(timestamp);
	const signature = bridgeSignature(secret, stamp, normalized);
	return {
		headers: {
			'content-type': 'application/json',
			'x-prismatica-bridge-timestamp': stamp,
			'x-prismatica-bridge-signature': badSignature ? signature.replace(/.$/, (last) => (last === '0' ? '1' : '0')) : signature,
		},
		body: JSON.stringify(normalized),
	};
}

export async function postJson(base, path, { headers = {}, body = {} } = {}) {
	const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
	const text = await response.text();
	return { status: response.status, text, body: text ? JSON.parse(text) : null };
}

export async function sendJson(base, path, { method = 'GET', headers = {}, body } = {}) {
	const response = await fetch(`${base}${path}`, { method, headers, body });
	const text = await response.text();
	return { status: response.status, text, body: text ? JSON.parse(text) : null };
}

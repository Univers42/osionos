/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-admin-verified.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
	bridgeSignature,
	configFromEnv,
	consumeHandoffToken,
	createBridgeHandoff,
	validateBridgePayload,
	verifyAppSessionToken,
	verifyBridgeRequest,
} from '../../scripts/bridge-api.mjs';

const secret = 'test-bridge-secret-that-is-long-enough';
const now = 1_768_000_000_000;
const ADMIN_EMAIL = 'boss@example.com';

function config(extra = {}) {
	return configFromEnv({
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_BRIDGE_SHARED_SECRET: secret,
		OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
		OSIONOS_BRIDGE_PERSISTENCE: 'memory',
		OSIONOS_ADMIN_EMAILS: ADMIN_EMAIL,
		...extra,
	});
}

function gatewayPayload(extra = {}) {
	return { provider: 'prismatica', subject: randomUUID(), email: ADMIN_EMAIL, name: 'Boss', jti: randomUUID(), ...extra };
}

async function sessionIsAdmin(payload, cfg = config(), fetchImpl = fetch) {
	const handoffStore = new Map();
	const handoff = await createBridgeHandoff({ payload: validateBridgePayload(payload), config: cfg, handoffStore, now, fetchImpl });
	const token = new URL(handoff.redirectUrl).hash.match(/bridge_token=([^&]+)/)[1];
	const { session } = consumeHandoffToken(decodeURIComponent(token), handoffStore, now);
	return verifyAppSessionToken(session.accessToken, cfg, now).isAdmin;
}

// Mirrors how the gateway signs: timestamp header + HMAC over the stable JSON of its payload.
function signedRequest(payload) {
	const timestamp = String(now);
	const headers = { 'x-prismatica-bridge-timestamp': timestamp, 'x-prismatica-bridge-signature': bridgeSignature(secret, timestamp, payload) };
	return { headers, payload, secret, now, replayStore: new Map() };
}

describe('admin promotion needs a verified email', () => {
	it('does not promote when emailVerified is absent', async () => {
		assert.equal(await sessionIsAdmin(gatewayPayload()), false);
	});

	it('does not promote when emailVerified is false', async () => {
		assert.equal(await sessionIsAdmin(gatewayPayload({ emailVerified: false })), false);
	});

	it('promotes a verified admin email', async () => {
		assert.equal(await sessionIsAdmin(gatewayPayload({ emailVerified: true })), true);
	});

	it('does not promote a verified non-admin email', async () => {
		assert.equal(await sessionIsAdmin(gatewayPayload({ emailVerified: true, email: 'other@example.com' })), false);
	});

	it('still reads a persisted admin flag back for an unverified login', async () => {
		const cfg = config({ KONG_SERVICE_API_KEY: 'service-role-test-key', OSIONOS_BAAS_URL: 'http://baas.local' });
		const requests = [];
		const fetchImpl = async (url, init = {}) => {
			requests.push(`${init.method ?? 'GET'} ${url}`);
			const body = String(url).includes('select=is_admin') ? [{ is_admin: true }] : [];
			return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
		};
		assert.equal(await sessionIsAdmin(gatewayPayload({ emailVerified: false }), cfg, fetchImpl), true);
		assert.ok(!requests.some((line) => line.startsWith('PATCH') && line.includes('osionos_bridge_identities')), 'no promotion write');
	});
});

describe('emailVerified on the signed payload', () => {
	for (const extra of [{ emailVerified: true }, { emailVerified: false }, {}]) {
		it(`verifies a payload signed with ${JSON.stringify(extra)}`, () => {
			const verified = verifyBridgeRequest(signedRequest(gatewayPayload(extra)));
			assert.equal(verified.emailVerified, extra.emailVerified);
		});
	}

	it('rejects a signature made without the field once the field is present', () => {
		const payload = gatewayPayload();
		const request = signedRequest(payload);
		assert.throws(() => verifyBridgeRequest({ ...request, payload: { ...payload, emailVerified: true } }), (e) => e.status === 401);
	});

	it('rejects a non-boolean emailVerified', () => {
		for (const bad of ['true', 1, null]) {
			assert.throws(() => validateBridgePayload(gatewayPayload({ emailVerified: bad })), (e) => e.status === 422);
		}
	});
});

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
	startBridgeServer,
	validateBridgePayload,
	verifyAppSessionToken,
	verifyBridgeRequest,
} from '../../scripts/bridge-api.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { noFactorPg } from './support/no-factor-pg.mjs';

import { PRIVATE_ID, SUBJECT, createSigninStub, hashOf, signIn, signinConfig } from './support/signin-world.mjs';

const secret = 'test-bridge-secret-that-is-long-enough';
const now = 1_768_000_000_000;
const ADMIN_EMAIL = 'boss@example.com';

function config(extra = {}) {
	return configFromEnv({
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_BRIDGE_SHARED_SECRET: secret,
		OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
		OSIONOS_BRIDGE_PERSISTENCE: 'memory',
		OSIONOS_BAAS_URL: '',
		OSIONOS_ADMIN_EMAILS: ADMIN_EMAIL,
		...extra,
	});
}

function gatewayPayload(extra = {}) {
	return { provider: 'prismatica', subject: randomUUID(), email: ADMIN_EMAIL, name: 'Boss', jti: randomUUID(), ...extra };
}

async function sessionIsAdmin(payload, cfg = config(), fetchImpl = fetch) {
	const kv = kvStub();
	const handoff = await createBridgeHandoff({ payload: validateBridgePayload(payload), config: cfg, pg: noFactorPg(), kv, now, fetchImpl });
	const token = new URL(handoff.redirectUrl).hash.match(/bridge_token=([^&]+)/)[1];
	const { session } = await consumeHandoffToken(decodeURIComponent(token), kv, now, cfg.appSessionSecret);
	return verifyAppSessionToken(session.accessToken, cfg, now).isAdmin;
}

// Mirrors how the gateway signs: timestamp header + HMAC over the stable JSON of its payload.
function signedRequest(payload) {
	const timestamp = String(now);
	const headers = { 'x-prismatica-bridge-timestamp': timestamp, 'x-prismatica-bridge-signature': bridgeSignature(secret, timestamp, payload) };
	return { headers, payload, secret, now };
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

// The administrator list is opt-in: an unset variable leaves nobody to promote, so a deployment
// that forgets it cannot hand is_admin to whoever signs in with the forgotten address.
describe('account administrators are opt-in', () => {
	it('configures no administrator when the variable is unset', () => {
		assert.deepEqual(configFromEnv({}).adminEmails, []);
	});

	it('configures no administrator when the variable is empty', () => {
		assert.deepEqual(configFromEnv({ OSIONOS_ADMIN_EMAILS: '' }).adminEmails, []);
	});

	it('parses the list: trimmed, lowercased, blanks dropped', () => {
		assert.deepEqual(configFromEnv({ OSIONOS_ADMIN_EMAILS: ' A@x.test , b@x.test ' }).adminEmails, ['a@x.test', 'b@x.test']);
	});

	it('promotes nobody at login when no administrator is configured', async () => {
		const stub = createSigninStub({});
		const { claims } = await signIn(stub, { email: 'anyone@example.test', emailVerified: true, config: signinConfig({ OSIONOS_ADMIN_EMAILS: '' }) });
		assert.equal(claims.isAdmin, false);
		assert.ok(!stub.kinds().includes('patch-admin'), 'no promotion write');
	});

	it('keeps a database-recorded administrator admin when the list is empty', async () => {
		const stub = createSigninStub({ identities: [{ provider: 'prismatica', subject: SUBJECT, email_hash: hashOf('owner@example.com'), is_admin: true, workspace_id: PRIVATE_ID }] });
		const { claims } = await signIn(stub, { email: 'owner@example.com', emailVerified: true, config: signinConfig({ OSIONOS_ADMIN_EMAILS: '' }) });
		assert.equal(claims.isAdmin, true);
	});

	it('warns once at start-up when no administrator is configured', async (t) => {
		assert.deepEqual(await bootWarnings(t, {}), ['[bridge] no account administrators configured (OSIONOS_ADMIN_EMAILS unset)']);
	});

	it('says nothing at start-up when an administrator is configured', async (t) => {
		assert.deepEqual(await bootWarnings(t, { OSIONOS_ADMIN_EMAILS: 'admin@example.test' }), []);
	});
});

/** Starts the bridge on a random port and returns the account-administrator lines it logged. */
async function bootWarnings(t, env) {
	const warn = t.mock.method(console, 'warn', () => {});
	try {
		const server = startBridgeServer({ ...configFromEnv(env), port: 0 });
		await new Promise((done) => (server.listening ? done() : server.once('listening', done)));
		await new Promise((done) => server.close(() => done()));
		return warn.mock.calls.map((call) => call.arguments.join(' ')).filter((line) => line.includes('account administrators'));
	} finally {
		warn.mock.restore();
	}
}

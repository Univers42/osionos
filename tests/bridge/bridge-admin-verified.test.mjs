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
import { readRefreshClaims } from '../../scripts/bridge-api.mjs';

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

describe('the admin flag is bound to the identity, not to the address (F-3b2)', () => {
	const OTHER = '9a9a9a9a-1111-4111-8111-9a9a9a9a9a9a';
	const row = (subject, email, isAdmin) => ({ provider: 'prismatica', subject, email_hash: hashOf(email), is_admin: isAdmin, workspace_id: PRIVATE_ID });
	const plain = signinConfig({ OSIONOS_ADMIN_EMAILS: '' });
	const adminReads = (stub) => stub.log.filter((entry) => entry.kind === 'get-admin');

	it('A1 never lets another subject\'s row decide the flag, and the read is keyed by identity', async () => {
		const stub = createSigninStub({ identities: [row(OTHER, 'x@example.com', true)] });
		const { claims } = await signIn(stub, { email: 'x@example.com', emailVerified: true, config: plain });
		assert.equal(claims.isAdmin, false);
		const reads = adminReads(stub);
		assert.ok(reads.length > 0, 'the fake saw an admin read');
		assert.ok(reads.every((entry) => entry.query.includes('provider=eq.') && entry.query.includes('subject=eq.') && !entry.query.includes('email_hash')));
		const control = createSigninStub({ identities: [row(SUBJECT, 'x@example.com', true)] });
		assert.equal((await signIn(control, { email: 'x@example.com', emailVerified: true, config: plain })).claims.isAdmin, true);
	});

	it('A2 keeps the caller\'s own admin row whatever its email_hash says', async () => {
		const stub = createSigninStub({ identities: [row(SUBJECT, 'old@example.com', true)] });
		const { claims } = await signIn(stub, { email: 'new@example.com', emailVerified: true, config: plain });
		assert.equal(claims.isAdmin, true);
		assert.ok(adminReads(stub).length > 0, 'the fake saw an admin read');
	});

	it('A3 scopes the promotion PATCH by provider and subject, never by hash', async () => {
		const stub = createSigninStub({ identities: [row(SUBJECT, 'boss@example.com', false)] });
		const { claims } = await signIn(stub, { email: 'boss@example.com', emailVerified: true });
		assert.equal(claims.isAdmin, true);
		const patches = stub.log.filter((entry) => entry.kind === 'patch-admin');
		assert.equal(patches.length, 1);
		assert.ok(patches[0].query.includes('provider=eq.') && patches[0].query.includes('subject=eq.') && !patches[0].query.includes('email_hash'));
		assert.equal(stub.identityRows[0].is_admin, true);
	});

	it('A4 a refresh whose token carries a stale email still reads the admin row', async () => {
		const stub = createSigninStub({ identities: [row(SUBJECT, 'old@example.com', true)] });
		const claims = await readRefreshClaims({ sub: SUBJECT, provider: 'prismatica', email: 'stale@example.com', workspace_ids: [PRIVATE_ID] }, { config: plain, pg: noFactorPg(), fetchImpl: stub.fetchImpl });
		assert.equal(claims.isAdmin, true);
		assert.ok(adminReads(stub).length > 0, 'the fake saw an admin read');
	});

	it('answers the env-only value without any request when the subject is missing', async () => {
		const stub = createSigninStub({});
		const claims = await readRefreshClaims({ sub: undefined, provider: 'prismatica', email: 'boss@example.com', workspace_ids: [] }, { config: signinConfig(), pg: noFactorPg(), fetchImpl: stub.fetchImpl });
		assert.equal(stub.log.filter((entry) => entry.name === 'osionos_bridge_identities').length, 0);
		assert.equal(claims.isAdmin, false);
	});
});

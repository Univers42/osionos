import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	bridgeSignature,
	configFromEnv,
	consumeHandoffToken,
	createBridgeHandoff,
	createUserSession,
	persistBridgeIdentity,
	searchUnsplashPhotos,
	stableStringify,
	validateBridgePayload,
	verifyBridgeRequest,
} from '../../scripts/bridge-api.mjs';

const subject = '3f6d2a70-5b3f-4c92-8f06-8f4644fd1209';
const jti = '1c76c7f0-f07e-442d-96fd-77d601764c3b';
const payload = {
	provider: 'prismatica',
	subject,
	email: 'Owner@example.com',
	name: 'Owner',
	jti,
};
const secret = 'test-bridge-secret-that-is-long-enough';
const now = 1_768_000_000_000;

function testConfig() {
	return configFromEnv({
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_BRIDGE_SHARED_SECRET: secret,
		OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
		OSIONOS_BRIDGE_PERSISTENCE: 'memory',
	});
}

describe('osionos bridge receiver', () => {
	it('canonicalizes signed payloads with stable key ordering', () => {
		assert.equal(stableStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
		assert.equal(stableStringify({ z: [{ b: true, a: false }] }), '{"z":[{"a":false,"b":true}]}');
	});

	it('accepts a valid HMAC bridge assertion', () => {
		const timestamp = String(now);
		const normalized = validateBridgePayload(payload);
		const signature = bridgeSignature(secret, timestamp, normalized);
		const result = verifyBridgeRequest({
			headers: {
				'x-prismatica-bridge-timestamp': timestamp,
				'x-prismatica-bridge-signature': signature,
			},
			payload,
			secret,
			now,
			replayStore: new Map(),
		});
		assert.equal(result.subject, subject);
		assert.equal(result.email, 'owner@example.com');
	});

	it('rejects tampered signatures and stale timestamps', () => {
		const timestamp = String(now);
		const signature = bridgeSignature(secret, timestamp, validateBridgePayload(payload));
		assert.throws(() => verifyBridgeRequest({
			headers: { 'x-prismatica-bridge-timestamp': timestamp, 'x-prismatica-bridge-signature': signature.replace(/.$/, '0') },
			payload,
			secret,
			now,
		}), /signature is invalid/);
		assert.throws(() => verifyBridgeRequest({
			headers: { 'x-prismatica-bridge-timestamp': String(now - 600_000), 'x-prismatica-bridge-signature': signature },
			payload,
			secret,
			now,
		}), /timestamp is outside/);
	});

	it('rejects replayed jti values', () => {
		const replayStore = new Map();
		const timestamp = String(now);
		const normalized = validateBridgePayload(payload);
		const signature = bridgeSignature(secret, timestamp, normalized);
		const request = { headers: { 'x-prismatica-bridge-timestamp': timestamp, 'x-prismatica-bridge-signature': signature }, payload, secret, now, replayStore };
		verifyBridgeRequest(request);
		assert.throws(() => verifyBridgeRequest(request), /replay rejected/);
	});

	it('rejects unexpected sensitive fields', () => {
		assert.throws(() => validateBridgePayload({ ...payload, password: 'nope' }), /Sensitive bridge field rejected/);
		assert.throws(() => validateBridgePayload({ ...payload, cookiePreferences: { analytics: true } }), /Sensitive bridge field rejected/);
		assert.throws(() => validateBridgePayload({ ...payload, city: 'Paris' }), /Sensitive bridge field rejected/);
	});

	it('creates an owner-scoped app session without database secrets', () => {
		const bridgeSession = createUserSession(validateBridgePayload(payload), testConfig(), null, now);
		const workspace = bridgeSession.session.privateWorkspaces[0];
		assert.equal(bridgeSession.session.userId, subject);
		assert.equal(workspace.ownerId, subject);
		assert.deepEqual(workspace.settings.permissions, ['create', 'read', 'update', 'delete', 'admin']);
		const serialized = JSON.stringify(bridgeSession);
		assert.doesNotMatch(serialized, /SERVICE_ROLE|JWT_SECRET|OSIONOS_BRIDGE_SHARED_SECRET|database_password/i);
		assert.doesNotMatch(bridgeSession.session.accessToken, /Owner@example\.com/i);
	});

	it('persists only hashed identity data through the BaaS RPC', async () => {
		let requestBody = null;
		const config = configFromEnv({
			OSIONOS_BAAS_URL: 'http://baas.local',
			OSIONOS_BRIDGE_SHARED_SECRET: secret,
			OSIONOS_BRIDGE_EMAIL_HASH_SALT: 'test-email-hash-salt',
			OSIONOS_BRIDGE_PERSISTENCE: 'baas',
			KONG_SERVICE_API_KEY: 'service-role-test-key',
		});
		const persisted = await persistBridgeIdentity(validateBridgePayload(payload), config, async (url, init) => {
			assert.equal(url, 'http://baas.local/rest/v1/rpc/osionos_bridge_upsert_workspace');
			assert.equal(init.headers.Authorization, 'Bearer service-role-test-key');
			requestBody = JSON.parse(init.body);
			return new Response(JSON.stringify([{
				workspace_id: 'ac47a462-a784-59cb-aa8d-c87a7251be1e',
				workspace_name: "Owner's osionos",
				workspace_slug: 'owner-osionos-3f6d2a70',
			}]), { status: 200, headers: { 'content-type': 'application/json' } });
		});
		assert.equal(requestBody.p_subject, subject);
		assert.equal(requestBody.p_provider, 'prismatica');
		assert.notEqual(requestBody.p_email_hash, payload.email.toLowerCase());
		assert.match(requestBody.p_email_hash, /^[a-f0-9]{64}$/);
		assert.equal(persisted.workspaceId, 'ac47a462-a784-59cb-aa8d-c87a7251be1e');
		assert.equal(persisted.workspaceSlug, 'owner-osionos-3f6d2a70');
	});

	it('does not persist handoffs when the app session secret is missing', async () => {
		let fetchCalled = false;
		const config = configFromEnv({
			OSIONOS_BRIDGE_SHARED_SECRET: secret,
			OSIONOS_BRIDGE_PERSISTENCE: 'baas',
			KONG_SERVICE_API_KEY: 'service-role-test-key',
		});
		await assert.rejects(() => createBridgeHandoff({
			payload: validateBridgePayload(payload),
			config,
			handoffStore: new Map(),
			now,
			fetchImpl: async () => {
				fetchCalled = true;
				return new Response('{}');
			},
		}), /app session secret is not configured/);
		assert.equal(fetchCalled, false);
	});

	it('creates a one-time handoff token for the frontend', async () => {
		const handoffStore = new Map();
		const handoff = await createBridgeHandoff({ payload: validateBridgePayload(payload), config: testConfig(), handoffStore, now });
		const bridgeToken = new URL(handoff.redirectUrl).hash.replace('#bridge_token=', '');
		assert.equal(handoff.ok, true);
		assert.equal(handoffStore.size, 1);
		const imported = consumeHandoffToken(decodeURIComponent(bridgeToken), handoffStore, now + 1000);
		assert.equal(imported.session.userId, subject);
		assert.equal(handoffStore.size, 0);
		assert.throws(() => consumeHandoffToken(decodeURIComponent(bridgeToken), handoffStore, now + 1000), /invalid/);
	});

	it('proxies Unsplash search with a server-side access key', async () => {
		const config = configFromEnv({ UNSPLASH_ACCESS_KEY: 'unsplash-test-key' });
		let requestedUrl = '';
		const result = await searchUnsplashPhotos({ query: 'team portraits', perPage: 4, orientation: 'portrait' }, config, async (url, init) => {
			requestedUrl = url;
			assert.equal(init.headers.Authorization, 'Client-ID unsplash-test-key');
			return new Response(JSON.stringify({
				total: 1,
				results: [{ id: 'photo-1', urls: { small: 'https://images.unsplash.com/small', regular: 'https://images.unsplash.com/regular' } }],
			}), { status: 200, headers: { 'content-type': 'application/json' } });
		});
		const url = new URL(requestedUrl);
		assert.equal(url.hostname, 'api.unsplash.com');
		assert.equal(url.searchParams.get('query'), 'team portraits');
		assert.equal(url.searchParams.get('per_page'), '4');
		assert.equal(url.searchParams.get('orientation'), 'portrait');
		assert.equal(result.results[0].id, 'photo-1');
	});

	it('rejects Unsplash search when the bridge key is missing', async () => {
		await assert.rejects(() => searchUnsplashPhotos({}, configFromEnv({}), async () => new Response('{}')), /Unsplash access key is not configured/);
	});

	it('keeps server-only secrets out of Vite-exposed environment variables', () => {
		const files = [
			resolve(process.cwd(), '.env.example'),
			resolve(process.cwd(), '../../opposite-osiris/.env.example'),
			resolve(process.cwd(), '../../../docker-compose.yml'),
		];
		for (const file of files) {
			const content = readFileSync(file, 'utf8');
			assert.doesNotMatch(content, /VITE_[A-Z0-9_]*(SERVICE_ROLE|JWT_SECRET|OSIONOS_BRIDGE_SHARED_SECRET|APP_SESSION_SECRET)/);
		}
	});
});
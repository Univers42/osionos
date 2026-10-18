/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-api.test.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/01 01:37:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	bridgeSignature,
	configFromEnv,
	consumeHandoffToken,
	createBridgeServer,
	createBridgeHandoff,
	createUserSession,
	persistBridgeIdentity,
	requireWorkspaceAccess,
	searchCoverPhotos,
	searchPixabayVideos,
	searchUnsplashPhotos,
	stableStringify,
	trackUnsplashDownload,
	unsplashDownloadUrl,
	validateBridgePayload,
	verifyAppSessionToken,
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
const workspaceId = '1cc0693b-59dd-4d51-86d9-de86d088f9df';
const pageId = '28196e1b-5dc6-44da-a4ee-098f27f04711';
const childPageId = 'bb44cf14-84df-4f08-8b02-97dc84727744';

function testConfig() {
	return configFromEnv({
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_BRIDGE_SHARED_SECRET: secret,
		OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
		OSIONOS_BRIDGE_PERSISTENCE: 'memory',
	});
}

function testBaasConfig() {
	return configFromEnv({
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_BRIDGE_SHARED_SECRET: secret,
		OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
		OSIONOS_BAAS_URL: 'http://baas.local',
		KONG_SERVICE_API_KEY: 'service-role-test-key',
	});
}

function appSession(config = testBaasConfig(), issuedAt = Date.now()) {
	return createUserSession(validateBridgePayload(payload), config, {
		workspaceId,
		workspaceName: "Owner's osionos",
		workspaceSlug: 'owner-osionos-3f6d2a70',
	}, issuedAt);
}

/** An Authorization header for a signed-in user. Rate limits are per user and
 *  live for the whole process, so a test that spends one passes its own `user`. */
function bearer(config, { user = subject, issuedAt = Date.now() } = {}) {
	const session = createUserSession(validateBridgePayload({ ...payload, subject: user }), config, null, issuedAt);
	return { authorization: `Bearer ${session.session.accessToken}` };
}

async function listen(server) {
	await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
	const address = server.address();
	return `http://127.0.0.1:${address.port}`;
}

function jsonResponse(value, status = 200) {
	return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function idsFromFilter(idFilter) {
	if (idFilter.startsWith('in.')) return idFilter.slice(4, -1).split(',').filter(Boolean);
	if (idFilter.startsWith('eq.')) return [idFilter.slice(3)];
	return [];
}

function selectedRows(pages, ids, workspaceFilter) {
	return [...pages.values()]
		.filter((row) => ids.length === 0 || ids.includes(row.id))
		.filter((row) => !workspaceFilter.startsWith('eq.') || row.workspace_id === workspaceFilter.slice(3));
}

function patchRows(pages, ids, updates) {
	const patched = [];
	for (const id of ids) {
		const row = pages.get(id);
		if (!row) continue;
		const next = { ...row, ...updates };
		pages.set(id, next);
		patched.push(next);
	}
	return patched;
}

function createMockBaasFetch() {
	const pages = new Map([
		[childPageId, {
			id: childPageId,
			workspace_id: workspaceId,
			parent_page_id: pageId,
			owner_id: subject,
			title: 'Child page',
			visibility: 'private',
			collaborators: [],
			properties: [],
			content: [],
			archived_at: null,
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-01T00:00:00.000Z',
		}],
	]);

	return {
		pages,
		fetchImpl: async (url, init = {}) => {
			const parsed = new URL(url);
			const table = parsed.pathname.split('/').pop();
			if (table === 'osionos_bridge_list_workspaces') {
				return jsonResponse([{
					workspace_id: workspaceId,
					owner_id: subject,
					workspace_name: "Owner's osionos",
					workspace_slug: 'owner-osionos-3f6d2a70',
					workspace_settings: { plan: 'Bridge' },
					workspace_role: 'owner',
					permissions: ['create', 'read', 'update', 'delete', 'admin'],
					created_at: '2026-01-01T00:00:00.000Z',
					updated_at: '2026-01-01T00:00:00.000Z',
				}]);
			}
			const ownerMember = { user_id: subject, workspace_id: workspaceId, role: 'owner', permissions: ['create', 'read', 'update', 'delete', 'admin'] };
			// The members-anchored list statement: the caller's members row with the workspace's pages under it.
			if (table === 'osionos_workspace_members') {
				return jsonResponse([{ ...ownerMember, workspace: { pages: selectedRows(pages, [], `eq.${workspaceId}`) } }]);
			}
			if (table !== 'osionos_pages') return jsonResponse({ message: 'not found' }, 404);

			const method = init.method ?? 'GET';
			const idFilter = parsed.searchParams.get('id') ?? '';
			const workspaceFilter = parsed.searchParams.get('workspace_id') ?? '';
			const ids = idsFromFilter(idFilter);

			if (method === 'POST') {
				const row = {
					...JSON.parse(init.body),
					id: pageId,
					created_at: '2026-01-01T00:00:00.000Z',
					updated_at: '2026-01-01T00:00:00.000Z',
					archived_at: null,
				};
				pages.set(pageId, row);
				return jsonResponse([row], 201);
			}

			if (method === 'PATCH') {
				const updates = JSON.parse(init.body);
				const patched = patchRows(pages, ids, updates);
				return init.headers?.Prefer === 'return=minimal' ? new Response(null, { status: 204 }) : jsonResponse(patched);
			}

			if (method === 'DELETE') {
				for (const id of ids) pages.delete(id);
				return new Response(null, { status: 204 });
			}

			return jsonResponse(selectedRows(pages, ids, workspaceFilter));
		},
	};
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

	it('verifies app-scoped session tokens and rejects invalid ones', () => {
		const config = testBaasConfig();
		const issuedAt = Date.now();
		const bridgeSession = appSession(config, issuedAt);
		const token = bridgeSession.session.accessToken;
		const verified = verifyAppSessionToken(token, config, issuedAt + 1000);
		assert.equal(verified.userId, subject);
		assert.deepEqual(verified.workspaceIds, [workspaceId]);

		const replacement = token.endsWith('a') ? 'b' : 'a';
		assert.throws(() => verifyAppSessionToken(token.slice(0, -1) + replacement, config, issuedAt + 1000), /signature is invalid/);
		assert.throws(() => verifyAppSessionToken(token, config, issuedAt + 3_700_000), /expired/);
	});

	it('requires both token scope and scoped BaaS workspace membership', async () => {
		const config = testBaasConfig();
		const token = appSession(config).session.accessToken;
		const request = { headers: { authorization: `Bearer ${token}` } };
		const allowed = await requireWorkspaceAccess(request, workspaceId, 'update', config, async (url, init = {}) => {
			const parsed = new URL(url);
			assert.equal(parsed.pathname.endsWith('/rpc/osionos_bridge_list_workspaces'), true);
			assert.deepEqual(JSON.parse(init.body), { p_user_id: subject, p_workspace_ids: [workspaceId] });
			return jsonResponse([{
				workspace_id: workspaceId,
				owner_id: subject,
				workspace_name: "Owner's osionos",
				workspace_slug: 'owner-osionos-3f6d2a70',
				workspace_settings: { plan: 'Bridge' },
				workspace_role: 'editor',
				permissions: ['read', 'update'],
			}]);
		});
		assert.equal(allowed.userId, subject);
		assert.equal(allowed.workspaceId, workspaceId);

		await assert.rejects(
			() => requireWorkspaceAccess(request, '2cc0693b-59dd-4d51-86d9-de86d088f9df', 'read', config, async () => jsonResponse([])),
			/not scoped/,
		);
		await assert.rejects(
			() => requireWorkspaceAccess(request, workspaceId, 'delete', config, async () => jsonResponse([{
				workspace_id: workspaceId,
				owner_id: subject,
				workspace_name: "Owner's osionos",
				workspace_slug: 'owner-osionos-3f6d2a70',
				workspace_settings: { plan: 'Bridge' },
				workspace_role: 'viewer',
				permissions: ['read'],
			}])),
			/permission denied/,
		);
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

	it('serves scoped workspace list and read routes from the bridge', async () => {
		const config = testBaasConfig();
		const { fetchImpl } = createMockBaasFetch();
		const server = createBridgeServer({ config, fetchImpl });
		const baseUrl = await listen(server);
		const token = appSession(config).session.accessToken;
		const headers = { authorization: `Bearer ${token}` };

		try {
			const listResponse = await fetch(`${baseUrl}/api/workspaces`, { headers });
			assert.equal(listResponse.status, 200);
			const workspaces = await listResponse.json();
			assert.equal(workspaces[0]._id, workspaceId);
			assert.equal(workspaces[0].role, 'owner');

			const readResponse = await fetch(`${baseUrl}/api/workspaces/${workspaceId}`, { headers });
			assert.equal(readResponse.status, 200);
			const workspace = await readResponse.json();
			assert.equal(workspace._id, workspaceId);
		} finally {
			await new Promise((resolveClose) => server.close(resolveClose));
		}
	});

	it('serves Postgres-backed page CRUD routes from the bridge', async () => {
		const config = testBaasConfig();
		const { pages, fetchImpl } = createMockBaasFetch();
		const server = createBridgeServer({ config, fetchImpl });
		const baseUrl = await listen(server);
		const token = appSession(config).session.accessToken;
		const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

		try {
			const createdResponse = await fetch(`${baseUrl}/api/pages`, {
				method: 'POST',
				headers,
				body: JSON.stringify({
					workspaceId,
					title: 'Pipeline Dashboard',
					icon: 'icon:gauge',
					surface: 'page',
					content: [{ id: 'block-1', type: 'paragraph', content: 'Persisted from bridge' }],
				}),
			});
			assert.equal(createdResponse.status, 201);
			const created = await createdResponse.json();
			assert.equal(created._id, pageId);
			assert.equal(created.workspaceId, workspaceId);

			const listedResponse = await fetch(`${baseUrl}/api/pages/all?workspaceId=${workspaceId}`, { headers });
			assert.equal(listedResponse.status, 200);
			const listed = await listedResponse.json();
			assert.equal(listed.length, 2);
			assert.equal(listed.some((page) => page.title === 'Pipeline Dashboard'), true);

			const readResponse = await fetch(`${baseUrl}/api/pages/${pageId}`, { headers });
			assert.equal(readResponse.status, 200);
			const readPage = await readResponse.json();
			assert.equal(readPage.content[0].content, 'Persisted from bridge');

			const archivedAt = '2026-05-10T12:00:00.000Z';
			const patchedResponse = await fetch(`${baseUrl}/api/pages/${pageId}`, {
				method: 'PATCH',
				headers,
				body: JSON.stringify({ title: 'Pipeline Dashboard v2', archivedAt }),
			});
			const patchedText = await patchedResponse.text();
			assert.equal(patchedResponse.status, 200, patchedText);
			const patched = JSON.parse(patchedText);
			// The page PATCH now responds return=minimal-style {ok,updatedAt} instead
			// of echoing the full row (the callers all ignore the body).
			assert.equal(patched.ok, true);
			assert.equal(typeof patched.updatedAt, 'string');
			// Cascade still archives descendants — guards the return=minimal cascade fix
			// (baasRest returns null on an empty body, so the guard can't depend on it).
			assert.equal(pages.get(childPageId).archived_at, archivedAt);

			const deletedResponse = await fetch(`${baseUrl}/api/pages/${pageId}`, { method: 'DELETE', headers });
			assert.equal(deletedResponse.status, 200);
			const deleted = await deletedResponse.json();
			assert.deepEqual(
				deleted.deletedIds.sort((left, right) => left.localeCompare(right)),
				[childPageId, pageId].sort((left, right) => left.localeCompare(right)),
			);
			assert.equal(pages.has(pageId), false);
			assert.equal(pages.has(childPageId), false);
		} finally {
			await new Promise((resolveClose) => server.close(resolveClose));
		}
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

	it('serves the photo search over HTTP: the uploads module does not swallow /api/media/unsplash/search', async () => {
		const config = { ...testConfig(), unsplashAccessKey: 'unsplash-route-key' };
		const upstream = [];
		const server = createBridgeServer({
			config,
			fetchImpl: async (url, init = {}) => {
				upstream.push({ url: String(url), authorization: init.headers?.Authorization });
				return new Response(JSON.stringify({
					total: 1,
					results: [{ id: 'photo-over-http', urls: { small: 'https://images.unsplash.com/small', regular: 'https://images.unsplash.com/regular' } }],
				}), { status: 200, headers: { 'content-type': 'application/json' } });
			},
		});
		const baseUrl = await listen(server);

		try {
			const response = await fetch(`${baseUrl}/api/media/unsplash/search?query=dispatcher%20order&perPage=3`, { headers: bearer(config) });
			assert.equal(response.status, 200);
			const payload = await response.json();
			assert.equal(payload.results[0].id, 'photo-over-http');
			assert.equal(upstream.length, 1);
			assert.equal(new URL(upstream[0].url).hostname, 'api.unsplash.com');
			assert.equal(upstream[0].authorization, 'Client-ID unsplash-route-key');
		} finally {
			await new Promise((resolveClose) => server.close(resolveClose));
		}
	});

	it('rejects Unsplash search when the bridge key is missing', async () => {
		await assert.rejects(() => searchUnsplashPhotos({}, configFromEnv({}), async () => new Response('{}')), /Unsplash access key is not configured/);
	});

	const pixabayHit = {
		id: 125,
		pageURL: 'https://pixabay.com/videos/id-125/',
		tags: 'flowers, yellow, blossom',
		duration: 12,
		user: 'Coverr-Free-Footage',
		videos: {
			large: { url: 'https://cdn.pixabay.com/video/125_large.mp4', width: 1920, height: 1080, size: 6615235, thumbnail: 'https://cdn.pixabay.com/video/125_large.jpg' },
			medium: { url: 'https://cdn.pixabay.com/video/125_medium.mp4', width: 1280, height: 720, size: 3562083, thumbnail: 'https://cdn.pixabay.com/video/125_medium.jpg' },
			small: { url: 'https://cdn.pixabay.com/video/125_small.mp4', width: 640, height: 360, size: 1030736, thumbnail: 'https://cdn.pixabay.com/video/125_small.jpg' },
			tiny: { url: 'https://cdn.pixabay.com/video/125_tiny.mp4', width: 480, height: 270, size: 426799, thumbnail: 'https://cdn.pixabay.com/video/125_tiny.jpg' },
		},
	};
	const pixabayResponse = () => new Response(JSON.stringify({ total: 4692, totalHits: 500, hits: [pixabayHit] }), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});

	it('searches Pixabay videos with a server-side key and returns cover-ready items', async () => {
		const config = configFromEnv({ PIXABAY_API: 'pixabay-test-key' });
		let requestedUrl = '';
		const result = await searchPixabayVideos({ query: 'yellow flowers', perPage: 6, page: 2 }, config, async (url) => {
			requestedUrl = String(url);
			return pixabayResponse();
		});
		const url = new URL(requestedUrl);
		assert.equal(`${url.origin}${url.pathname}`, 'https://pixabay.com/api/videos/');
		assert.equal(url.searchParams.get('key'), 'pixabay-test-key');
		assert.equal(url.searchParams.get('q'), 'yellow flowers');
		assert.equal(url.searchParams.get('per_page'), '6');
		assert.equal(url.searchParams.get('page'), '2');
		assert.equal(url.searchParams.get('safesearch'), 'true');
		assert.deepEqual(result.results, [{
			id: 'pixabay-125',
			label: 'flowers, yellow, blossom',
			ref: 'https://cdn.pixabay.com/video/125_medium.mp4',
			previewUrl: 'https://cdn.pixabay.com/video/125_tiny.jpg',
			previewVideoUrl: 'https://cdn.pixabay.com/video/125_tiny.mp4',
			credit: 'Pixabay · Coverr-Free-Footage',
		}]);
		assert.equal(result.total, 500);
	});

	it('rejects a Pixabay search without a key, and never puts the key in an upstream error', async () => {
		await assert.rejects(() => searchPixabayVideos({ query: 'sea' }, configFromEnv({}), async () => pixabayResponse()), /Pixabay API key is not configured/);
		const config = configFromEnv({ PIXABAY_API_KEY: 'secret-pixabay-key' });
		await assert.rejects(
			() => searchPixabayVideos({ query: 'sea' }, config, async () => new Response('[ERROR 429] API rate limit exceeded', { status: 429 })),
			(error) => error.status === 502 && /429/.test(error.message) && !error.message.includes('secret-pixabay-key'),
		);
	});

	it('serves the video search over HTTP and asks Pixabay once per query (their 24h caching rule)', async () => {
		const config = { ...testConfig(), pixabayApiKey: 'pixabay-route-key' };
		let upstreamCalls = 0;
		const server = createBridgeServer({ config, fetchImpl: async () => { upstreamCalls += 1; return pixabayResponse(); } });
		const baseUrl = await listen(server);

		try {
			const first = await fetch(`${baseUrl}/api/media/pixabay/videos?query=cache%20once%20per%20query`, { headers: bearer(config) });
			assert.equal(first.status, 200);
			assert.equal((await first.json()).results[0].id, 'pixabay-125');
			const second = await fetch(`${baseUrl}/api/media/pixabay/videos?query=cache%20once%20per%20query`, { headers: bearer(config) });
			assert.equal(second.status, 200);
			assert.equal((await second.json()).results[0].ref, 'https://cdn.pixabay.com/video/125_medium.mp4');
			assert.equal(upstreamCalls, 1);
		} finally {
			await new Promise((resolveClose) => server.close(resolveClose));
		}
	});

	it('keeps server-only secrets out of Vite-exposed environment variables', () => {
		const files = [
			resolve(process.cwd(), '.env.example'),
			resolve(process.cwd(), '../../opposite-osiris/.env.example'),
			resolve(process.cwd(), '../../../docker-compose.yml'),
		];
		for (const file of files) {
			if (!existsSync(file)) continue;
			const content = readFileSync(file, 'utf8');
			assert.doesNotMatch(content, /VITE_[A-Z0-9_]*(SERVICE_ROLE|JWT_SECRET|OSIONOS_BRIDGE_SHARED_SECRET|APP_SESSION_SECRET)/);
		}
	});
});

describe('media routes spend provider keys, so they need a signed-in user', () => {
	const mediaConfig = () => ({ ...testConfig(), unsplashAccessKey: 'unsplash-media-key', pixabayApiKey: 'pixabay-media-key' });
	const DOWNLOAD = 'https://api.unsplash.com/photos/LBI7cgq3pbM/download?ixid=M3wxMjA3fDB8MXxzZWFyY2h8';
	const postDownload = (baseUrl, headers, downloadLocation = DOWNLOAD) => fetch(`${baseUrl}/api/media/unsplash/download`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify({ downloadLocation }),
	});

	/** Serves `handler` as the upstream and hands the test the bridge URL and the upstream calls. */
	async function withBridge(config, handler, run) {
		const calls = [];
		const server = createBridgeServer({
			config,
			fetchImpl: async (url, init = {}) => {
				calls.push({ url: String(url), init });
				return handler(String(url), init);
			},
		});
		const baseUrl = await listen(server);
		try {
			await run(baseUrl, calls);
		} finally {
			await new Promise((resolveClose) => server.close(resolveClose));
		}
	}
	const emptyResults = () => new Response(JSON.stringify({ results: [], hits: [] }), { status: 200, headers: { 'content-type': 'application/json' } });

	it('answers 401 without a session, with a garbage token and with an expired one, and never calls the provider', async () => {
		const config = mediaConfig();
		const expired = bearer(config, { issuedAt: Date.now() - (config.sessionTtlSeconds + 60) * 1000 });
		await withBridge(config, emptyResults, async (baseUrl, calls) => {
			for (const headers of [{}, { authorization: 'Bearer not-a-session' }, expired]) {
				assert.equal((await fetch(`${baseUrl}/api/media/unsplash/search?query=anonymous`, { headers })).status, 401);
				assert.equal((await fetch(`${baseUrl}/api/media/pixabay/videos?query=anonymous`, { headers })).status, 401);
				assert.equal((await postDownload(baseUrl, headers)).status, 401);
			}
			assert.equal(calls.length, 0);
		});
	});

	it('answers 503, not 200, when the bridge has no session secret to check a token with', async () => {
		const config = { ...mediaConfig(), appSessionSecret: '' };
		await withBridge(config, emptyResults, async (baseUrl, calls) => {
			const response = await fetch(`${baseUrl}/api/media/unsplash/search?query=unconfigured`, { headers: { authorization: 'Bearer osionos_v1.a.b' } });
			assert.equal(response.status, 503);
			assert.equal(calls.length, 0);
		});
	});

	it('limits searches per user: one user running out does not slow another down', async () => {
		const config = mediaConfig();
		const heavyUser = bearer(config, { user: randomUUID() });
		await withBridge(config, emptyResults, async (baseUrl) => {
			const statuses = [];
			// 40 are allowed in a burst and 2 more each second; 80 back to back must hit the limit.
			for (let attempt = 0; attempt < 80 && statuses.at(-1) !== 429; attempt += 1) {
				statuses.push((await fetch(`${baseUrl}/api/media/unsplash/search?query=limit`, { headers: heavyUser })).status);
			}
			assert.equal(statuses.at(-1), 429);
			assert.ok(statuses.length > 40, `the first 40 are allowed, refused after ${statuses.length - 1}`);
			assert.ok(statuses.slice(0, -1).every((status) => status === 200));
			// Photo and video searches draw on the same allowance.
			assert.equal((await fetch(`${baseUrl}/api/media/pixabay/videos?query=limit`, { headers: heavyUser })).status, 429);
			const otherUser = bearer(config, { user: randomUUID() });
			assert.equal((await fetch(`${baseUrl}/api/media/unsplash/search?query=limit`, { headers: otherUser })).status, 200);
		});
	});

	it('reports a picked photo to Unsplash at a URL rebuilt from constants, without following a redirect', async () => {
		const config = mediaConfig();
		const user = bearer(config, { user: randomUUID() });
		const redirect = () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example/' } });
		await withBridge(config, redirect, async (baseUrl, calls) => {
			const response = await postDownload(baseUrl, user, `${DOWNLOAD}&utm=dropped`);
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { ok: true });
			assert.equal(calls.length, 1);
			assert.equal(calls[0].url, DOWNLOAD);
			assert.equal(calls[0].init.redirect, 'manual');
			assert.equal(calls[0].init.headers.Authorization, 'Client-ID unsplash-media-key');
		});
	});

	it('refuses to track anything that is not an Unsplash download URL, and caps the request body', async () => {
		const config = mediaConfig();
		const user = bearer(config, { user: randomUUID() });
		await withBridge(config, emptyResults, async (baseUrl, calls) => {
			assert.equal((await postDownload(baseUrl, user, 'https://internal.example/photos/x/download')).status, 400);
			assert.equal((await postDownload(baseUrl, user, `${DOWNLOAD}&pad=${'x'.repeat(4096)}`)).status, 413);
			assert.equal(calls.length, 0);
		});
	});

	it('unsplashDownloadUrl keeps only the photo id and the ixid token', () => {
		const canonical = 'https://api.unsplash.com/photos/LBI7cgq3pbM/download';
		const accepted = [
			[`${canonical}?ixid=abc_DEF-123`, `${canonical}?ixid=abc_DEF-123`],
			[canonical, canonical],
			['https://API.UNSPLASH.COM/photos/LBI7cgq3pbM/download', canonical],
			['https://api.unsplash.com:443/photos/LBI7cgq3pbM/download', canonical],
			['https:\\\\api.unsplash.com\\photos\\LBI7cgq3pbM\\download', canonical],
			[`${canonical}?ixid=tok&redirect=https://evil.example&w=1`, `${canonical}?ixid=tok`],
			[`${canonical}#fragment`, canonical],
		];
		for (const [given, expected] of accepted) assert.equal(unsplashDownloadUrl(given), expected, given);

		const rejected = [
			'https://user:pass@api.unsplash.com/photos/LBI7cgq3pbM/download',
			'https://api.unsplash.com@evil.example/photos/LBI7cgq3pbM/download',
			'https://api.unspl\u0430sh.com/photos/LBI7cgq3pbM/download', // Cyrillic "a"
			'https://api.unsplash.com./photos/LBI7cgq3pbM/download',
			'https://api.unsplash.com.evil.example/photos/LBI7cgq3pbM/download',
			'https://api.unsplash.com:8443/photos/LBI7cgq3pbM/download',
			'http://api.unsplash.com/photos/LBI7cgq3pbM/download',
			'https://api.unsplash.com/photos/x/../../me/download',
			'https://api.unsplash.com/photos/%2e%2e/%2e%2e/me/download',
			'https://api.unsplash.com/photos/a%2Fb/download',
			'https://api.unsplash.com/photos/LBI7cgq3pbM/download/extra',
			'https://api.unsplash.com/photos/LBI7cgq3pbM',
			'https://api.unsplash.com/me',
			`${canonical}?ixid=has space`,
			`${canonical}?ixid=${'x'.repeat(257)}`,
			'//api.unsplash.com/photos/LBI7cgq3pbM/download',
			'not a url',
			'',
			null,
			undefined,
			['https://api.unsplash.com/photos/a/download', 'https://evil.example/'],
			{ href: canonical },
		];
		for (const given of rejected) assert.equal(unsplashDownloadUrl(given), null, String(given));
	});

	it('trackUnsplashDownload: an upstream error is a 502, a missing key a 503', async () => {
		const config = mediaConfig();
		await assert.rejects(() => trackUnsplashDownload(DOWNLOAD, config, async () => new Response('gone', { status: 404 })), (error) => error.status === 502 && !error.message.includes('unsplash-media-key'));
		await assert.rejects(() => trackUnsplashDownload(DOWNLOAD, { ...config, unsplashAccessKey: '' }, async () => new Response('{}')), (error) => error.status === 503);
		assert.deepEqual(await trackUnsplashDownload(DOWNLOAD, config, async () => new Response('{"url":"https://unsplash.com/photos/x"}')), { ok: true });
	});

	it('keeps all users together under Pixabay\'s per-key limit, counting only cache misses', async () => {
		const config = mediaConfig();
		let upstreamCalls = 0;
		const videos = () => new Response(JSON.stringify({ totalHits: 0, hits: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
		await withBridge(config, () => { upstreamCalls += 1; return videos(); }, async (baseUrl) => {
			const statuses = [];
			// Different users, different queries: each one misses the cache.
			for (let query = 0; query < 120 && statuses.at(-1) !== 429; query += 1) {
				const user = bearer(config, { user: randomUUID() });
				statuses.push((await fetch(`${baseUrl}/api/media/pixabay/videos?query=upstream-${query}`, { headers: user })).status);
			}
			assert.equal(statuses.at(-1), 429);
			assert.ok(statuses.slice(0, -1).every((status) => status === 200));
			// The allowance is per process, and an earlier test in this file already spent some of it.
			assert.ok(upstreamCalls > 80 && upstreamCalls <= 90, `asked Pixabay ${upstreamCalls} times`);
			// A cached query costs nothing upstream, so it is still answered.
			const cached = await fetch(`${baseUrl}/api/media/pixabay/videos?query=upstream-0`, { headers: bearer(config, { user: randomUUID() }) });
			assert.equal(cached.status, 200);
		});
	});

	it('falls back to Openverse when the Unsplash quota is spent, but not when Unsplash is broken', async () => {
		const config = mediaConfig();
		const openverse = () => new Response(JSON.stringify({ result_count: 1, results: [{ id: 'cc-1', title: 'Free photo', url: 'https://cdn.example/cc-1.jpg', creator: 'Someone' }] }), { status: 200 });
		const upstream = (unsplashStatus) => async (url) => (new URL(url).hostname === 'api.unsplash.com' ? new Response('refused', { status: unsplashStatus }) : openverse());

		for (const status of [403, 429]) {
			const result = await searchCoverPhotos({ query: `quota spent ${status}` }, config, upstream(status));
			assert.equal(result.results[0].id, 'ov-cc-1');
		}
		await assert.rejects(() => searchCoverPhotos({ query: 'unsplash is down' }, config, upstream(500)), (error) => error.status === 502);
	});
});

describe('a member\'s private page stays theirs in a shared workspace', () => {
	const otherMember = '6a1e5f1c-8f0b-4f0e-9a43-6d0c2b7b1a11';
	const otherPrivateId = '9e3c2a51-1d4f-4f7e-8c2a-1b6d0e9f7a01';
	const otherSharedId = '9e3c2a51-1d4f-4f7e-8c2a-1b6d0e9f7a02';
	const row = (id, visibility, extra = {}) => ({
		id, workspace_id: workspaceId, parent_page_id: null, owner_id: otherMember, title: `${visibility} page of another member`,
		visibility, collaborators: [], properties: [], content: [], archived_at: null,
		created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', ...extra,
	});

	it('the page list and a page read leave out another member\'s private page and keep their shared one', async () => {
		const config = testBaasConfig();
		const { pages, fetchImpl } = createMockBaasFetch();
		pages.set(otherPrivateId, row(otherPrivateId, 'private'));
		pages.set(otherSharedId, row(otherSharedId, 'shared'));
		const server = createBridgeServer({ config, fetchImpl });
		const baseUrl = await listen(server);
		const headers = { authorization: `Bearer ${appSession(config).session.accessToken}` };
		try {
			const listed = await (await fetch(`${baseUrl}/api/pages/all?workspaceId=${workspaceId}`, { headers })).json();
			const ids = listed.map((page) => page._id);
			assert.equal(ids.includes(otherSharedId), true);
			assert.equal(ids.includes(otherPrivateId), false);
			assert.equal(ids.includes(childPageId), true);
			assert.equal((await fetch(`${baseUrl}/api/pages/${otherPrivateId}`, { headers })).status, 404);
			assert.equal((await fetch(`${baseUrl}/api/pages/${otherSharedId}`, { headers })).status, 200);
		} finally {
			await new Promise((resolveClose) => server.close(resolveClose));
		}
	});
});

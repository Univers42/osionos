import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import {
	configFromEnv,
	createBridgeServer,
	createUserSession,
	validateBridgePayload,
} from '../../scripts/bridge-api.mjs';
import { pngFixture } from './support/image-fixtures.mjs';
import { mediaKeysFromEnv, signMediaPath, verifyMediaSignature } from '../../scripts/bridge-media-sign.mjs';
import { createMediaHandler } from '../../scripts/bridge-media.mjs';
import { createServer } from 'node:http';

const subject = '3f6d2a70-5b3f-4c92-8f06-8f4644fd1209';
const payload = {
	provider: 'prismatica',
	subject,
	email: 'Owner@example.com',
	name: 'Owner',
	jti: '1c76c7f0-f07e-442d-96fd-77d601764c3b',
};

function testConfig() {
	return configFromEnv({
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_BRIDGE_SHARED_SECRET: 'test-bridge-secret-that-is-long-enough',
		OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
		OSIONOS_BRIDGE_PERSISTENCE: 'memory',
	});
}

function appSessionToken(config) {
	return createUserSession(validateBridgePayload(payload), config, {
		workspaceId: '1cc0693b-59dd-4d51-86d9-de86d088f9df',
		workspaceName: "Owner's osionos",
		workspaceSlug: 'owner-osionos-3f6d2a70',
	}, Date.now()).session.accessToken;
}

/** In-memory stand-in for the storage router (bucket ensure / PUT / GET). */
function fakeStorageFetch(objects) {
	return async (input, init = {}) => {
		const url = String(input);
		const method = (init.method || 'GET').toUpperCase();
		if (url.includes('/bucket/') && method === 'POST') {
			return new Response(JSON.stringify({ created: false }), { status: 200 });
		}
		const object = /\/object\/[^/]+\/(.+)$/.exec(new URL(url).pathname);
		if (object && method === 'PUT') {
			const owner = init.headers?.['x-user-id'];
			objects.set(`${owner}/${decodeURIComponent(object[1])}`, {
				body: Buffer.from(init.body),
				contentType: init.headers?.['content-type'],
			});
			return new Response(JSON.stringify({ ok: true }), { status: 200 });
		}
		if (object && method === 'GET') {
			const owner = init.headers?.['x-user-id'];
			const stored = objects.get(`${owner}/${decodeURIComponent(object[1])}`);
			if (!stored) return new Response('missing', { status: 404 });
			return new Response(stored.body, {
				status: 200,
				headers: { 'content-type': stored.contentType },
			});
		}
		return new Response('unexpected', { status: 500 });
	};
}

async function listen(server) {
	await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
	return `http://127.0.0.1:${server.address().port}`;
}

// #235/#233 step 1 (devil 2026-11-03): a signature or the owner's session opens media; the bare
// URL still serves until MEDIA_URL_ENFORCE=true, which refuses it.
const SECRET = 'media-url-secret-for-tests-0123456789';
const OTHER = '9b2f6c1e-1111-4a2b-8c3d-000000000001';

function serverWith(env) {
	const saved = { ...process.env };
	Object.assign(process.env, env);
	try {
		const objects = new Map();
		const config = testConfig();
		return { config, server: createBridgeServer({ config, fetchImpl: fakeStorageFetch(objects) }) };
	} finally {
		for (const key of Object.keys(env)) {
			if (key in saved) process.env[key] = saved[key];
			else delete process.env[key];
		}
	}
}

async function uploadOne(base, token) {
	const res = await fetch(`${base}/api/media/uploads?name=a.png`, {
		method: 'POST',
		headers: { 'content-type': 'image/png', authorization: `Bearer ${token}` },
		body: pngFixture({ width: 2, height: 2 }),
	});
	return (await res.json()).media.url;
}

describe('signing and verifying a media path', () => {
	const keys = mediaKeysFromEnv({ MEDIA_URL_SECRET: SECRET });
	const path = `/api/media/uploads/${subject}/${'a'.repeat(64)}.png`;
	const params = (url) => new URL(url, 'http://x').searchParams;

	it('signs the same URL for every render in one hour, valid 1 to 2 hours', () => {
		const at = 1_800_000_100;
		assert.equal(signMediaPath(keys, path, at), signMediaPath(keys, path, at + 3000));
		const exp = Number(params(signMediaPath(keys, path, at)).get('exp'));
		assert.ok(exp - at >= 3600 && exp - at <= 7200, String(exp - at));
	});

	it('verifies its own path only, until exp, with the current or previous key', () => {
		const at = 1_800_000_100;
		const signed = params(signMediaPath(keys, path, at));
		assert.equal(verifyMediaSignature(keys, path, signed, at), true);
		assert.equal(verifyMediaSignature(keys, path.replace('a.png', 'b.png'), signed, at), false);
		assert.equal(verifyMediaSignature(keys, path, signed, Number(signed.get('exp')) + 1), false);
		const rotated = mediaKeysFromEnv({ MEDIA_URL_SECRET: 'a-new-secret-0123456789', MEDIA_URL_SECRET_PREVIOUS: SECRET });
		assert.equal(verifyMediaSignature(rotated, path, signed, at), true);
		assert.equal(verifyMediaSignature(mediaKeysFromEnv({ MEDIA_URL_SECRET: 'unrelated-secret-0123' }), path, signed, at), false);
	});

	it('refuses malformed parameters and signs nothing without a key', () => {
		for (const query of ['exp=x&kid=00000000&sig=' + '0'.repeat(64), 'exp=9999999999&kid=zz&sig=' + '0'.repeat(64), 'exp=9999999999&kid=00000000&sig=short']) {
			assert.equal(verifyMediaSignature(keys, path, new URLSearchParams(query), 1), false, query);
		}
		assert.equal(signMediaPath([], path), null);
	});
});

describe('media reads with signed links (enforce off: nothing that works today breaks)', () => {
	const { config, server } = serverWith({ MEDIA_URL_SECRET: SECRET });
	let base;
	before(async () => { base = await listen(server); });
	after(() => server.close());

	it('signs the caller\'s own paths, absolute or not, and leaves others out', async () => {
		const token = appSessionToken(config);
		const own = await uploadOne(base, token);
		const foreign = own.replace(subject, OTHER);
		const res = await fetch(`${base}/api/media/uploads/sign`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
			body: JSON.stringify({ paths: [own, `https://bridge.example${own}`, foreign, 'not a path'] }),
		});
		assert.equal(res.status, 200);
		const { signed } = await res.json();
		assert.deepEqual(Object.keys(signed).sort(), [own, `https://bridge.example${own}`].sort());
		const ok = await fetch(`${base}${signed[own]}`);
		assert.equal(ok.status, 200);
		assert.equal(ok.headers.get('content-type'), 'image/png');
	});

	it('refuses a tampered or expired signature even though bare reads are still open', async () => {
		const own = await uploadOne(base, appSessionToken(config));
		const tampered = await fetch(`${base}${own}?exp=9999999999&kid=00000000&sig=${'0'.repeat(64)}`);
		assert.equal(tampered.status, 403);
		const expired = signMediaPath(mediaKeysFromEnv({ MEDIA_URL_SECRET: SECRET }), own, 1_000_000_000);
		assert.equal((await fetch(`${base}${expired}`)).status, 403);
	});

	it('still serves the bare URL, as today', async () => {
		const own = await uploadOne(base, appSessionToken(config));
		assert.equal((await fetch(`${base}${own}`)).status, 200);
	});

	it('needs a session to sign', async () => {
		const res = await fetch(`${base}/api/media/uploads/sign`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"paths":[]}' });
		assert.equal(res.status, 401);
	});
});

describe('MEDIA_URL_ENFORCE=true', () => {
	const { config, server } = serverWith({ MEDIA_URL_SECRET: SECRET, MEDIA_URL_ENFORCE: 'true' });
	let base;
	before(async () => { base = await listen(server); });
	after(() => server.close());

	it('refuses the bare URL and opens a signed one or the owner\'s session (the AI service path)', async () => {
		const token = appSessionToken(config);
		const own = await uploadOne(base, token);
		assert.equal((await fetch(`${base}${own}`)).status, 403);
		assert.equal((await fetch(`${base}${own}`, { headers: { authorization: `Bearer ${token}` } })).status, 200);
		assert.equal((await fetch(`${base}${signMediaPath(mediaKeysFromEnv({ MEDIA_URL_SECRET: SECRET }), own)}`)).status, 200);
	});

	it('refuses to start without a secret, rather than serve nothing', () => {
		assert.throws(() => serverWith({ MEDIA_URL_ENFORCE: 'true', MEDIA_URL_SECRET: '' }), /MEDIA_URL_SECRET/);
	});
});

describe('signing for a page the caller can read (a teammate on a shared page)', () => {
	const READER = '7a7a7a7a-0000-4000-8000-000000000001';
	const ownerImage = `/api/media/uploads/${subject}/${'b'.repeat(64)}.png`;
	const elsewhere = `/api/media/uploads/${subject}/${'c'.repeat(64)}.png`;
	const pages = new Map([
		['page-shared', { content: [{ type: 'image', content: `http://bridge.example${ownerImage}` }], cover: null }],
		['page-cover', { content: [], cover: `http://bridge.example${elsewhere}` }],
	]);
	let server;
	let base;
	before(async () => {
		const saved = process.env.MEDIA_URL_SECRET;
		process.env.MEDIA_URL_SECRET = SECRET;
		const handle = createMediaHandler({
			config: testConfig(),
			verifySession: () => ({ userId: READER }),
			readPage: async (_request, pageId) => {
				if (!pages.has(pageId)) throw Object.assign(new Error('not found'), { status: 404 });
				return pages.get(pageId);
			},
		});
		if (saved === undefined) delete process.env.MEDIA_URL_SECRET;
		else process.env.MEDIA_URL_SECRET = saved;
		server = createServer((request, response) => handle(new URL(request.url, 'http://bridge.example'), request, response));
		base = await listen(server);
	});
	after(() => server.close());

	const sign = (body) => fetch(`${base}/api/media/uploads/sign`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: 'Bearer reader' },
		body: JSON.stringify(body),
	}).then((res) => res.json());

	it('signs the owner\'s image that appears in the page the reader opened', async () => {
		const { signed } = await sign({ pageId: 'page-shared', paths: [ownerImage, elsewhere] });
		assert.deepEqual(Object.keys(signed), [ownerImage]);
		assert.match(signed[ownerImage], /\?exp=\d+&kid=[0-9a-f]{8}&sig=[0-9a-f]{64}$/);
	});

	it('signs a cover too', async () => {
		const { signed } = await sign({ pageId: 'page-cover', paths: [elsewhere] });
		assert.deepEqual(Object.keys(signed), [elsewhere]);
	});

	it('signs nothing of someone else\'s for a page the reader cannot read, or with no page', async () => {
		assert.deepEqual((await sign({ pageId: 'page-hidden', paths: [ownerImage] })).signed, {});
		assert.deepEqual((await sign({ paths: [ownerImage] })).signed, {});
	});
});

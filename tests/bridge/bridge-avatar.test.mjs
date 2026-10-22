/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-avatar.test.mjs                             :::      :::    :::   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P0-6: the avatar bytes live in storage and the profile holds the path. The
// upload is checked (WebP or JPEG, exactly square, under its cap), stripped of
// its metadata, stored content-addressed, and the profile is patched with ONE
// path. The delete clears the profile AND the legacy blob, so a later migration
// cannot restore an avatar the user removed.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';
import { htmlFixture, jpegFixture, pngFixture, webpFixture } from './support/image-fixtures.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA);
const SIZES = [64, 160, 460];

/** The storage router in memory, over a real socket: the bridge reaches it with the global fetch. */
async function storageRouter() {
	const objects = new Map();
	let puts = 0;
	let gets = 0;
	const server = createServer((request, response) => {
		const url = new URL(request.url, 'http://storage.test');
		if (url.pathname.includes('/bucket/')) {
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end('{"created":false}');
			return;
		}
		const key = `${request.headers['x-user-id']}/${decodeURIComponent(/\/object\/[^/]+\/(.+)$/.exec(url.pathname)[1])}`;
		if (request.method === 'PUT') {
			puts += 1;
			const chunks = [];
			request.on('data', (chunk) => chunks.push(chunk));
			request.on('end', () => {
				objects.set(key, { body: Buffer.concat(chunks), contentType: request.headers['content-type'] });
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end('{"ok":true}');
			});
			return;
		}
		gets += 1;
		const stored = objects.get(key);
		if (!stored) {
			response.writeHead(404);
			response.end('missing');
			return;
		}
		response.writeHead(200, { 'content-type': stored.contentType });
		response.end(stored.body);
	});
	await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
	const previous = process.env.STORAGE_ROUTER_URL;
	process.env.STORAGE_ROUTER_URL = `http://127.0.0.1:${server.address().port}/storage/v1`;
	return {
		objects,
		stats: () => ({ puts, gets }),
		restore: () => { process.env.STORAGE_ROUTER_URL = previous; },
		close: () => new Promise((done) => server.close(done)),
	};
}

/** A bridge whose BaaS is the PostgREST mock and whose storage is the router above. */
async function avatarBridge(run, { identities = [] } = {}) {
	const storage = await storageRouter();
	const mock = createPostgrestMock({
		osionos_bridge_identities: identities,
		osionos_profiles: [{ user_id: IDS.userA, display_name: 'Alice', avatar_url: null }],
	});
	try {
		return await withBridge(config, mock.fetchImpl, (base) => run({ base, storage, mock }));
	} finally {
		storage.restore();
		await storage.close();
	}
}

const base64 = (buffer) => buffer.toString('base64');

/** A body of three square WebP variants, the shape the client posts. */
function variantBody(sizes = { 64: 64, 160: 160, 460: 460 }, format = 'webp') {
	const build = format === 'webp'
		? (size) => webpFixture({ width: size, height: size })
		: (size) => jpegFixture({ width: size, height: size });
	return { variants: Object.fromEntries(Object.entries(sizes).map(([key, size]) => [key, base64(build(size))])) };
}

const writesTo = (mock, table) => mock.calls.filter((call) => call.method === 'PATCH' && call.table === table);

describe('POST /api/profile/avatar', () => {
	it('stores the three variants and patches the profile with the 160px one', async () => {
		await avatarBridge(async ({ base, storage, mock }) => {
			const result = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(variantBody()) });
			assert.equal(result.status, 201, result.text);

			const keys = [...storage.objects.keys()].map((key) => key.split('/')[1]);
			assert.equal(keys.length, 3, keys.join(', '));
			const sha = keys[0].split('-')[0];
			assert.match(sha, /^[0-9a-f]{64}$/);
			assert.deepEqual(keys.sort(), [`${sha}-160.webp`, `${sha}-460.webp`, `${sha}-64.webp`].sort());

			const patches = writesTo(mock, 'osionos_profiles');
			assert.equal(patches.length, 1);
			assert.equal(patches[0].body.avatar_url, `/api/media/avatars/${IDS.userA}/${sha}-160.webp`);
			assert.equal(result.body.avatarPath, `/api/media/avatars/${IDS.userA}/${sha}-160.webp`);
		});
	});

	it('accepts a JPEG set as well as a WebP one', async () => {
		await avatarBridge(async ({ base, storage }) => {
			const result = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(variantBody(undefined, 'jpeg')) });
			assert.equal(result.status, 201, result.text);
			assert.ok([...storage.objects.keys()].some((key) => key.endsWith('.jpg')), [...storage.objects.keys()].join(', '));
		});
	});

	it('refuses a variant that is not square at its size, writing nothing', async () => {
		await avatarBridge(async ({ base, storage, mock }) => {
			const result = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(variantBody({ 64: 32, 160: 160, 460: 460 })) });
			assert.equal(result.status, 422, result.text);
			assert.equal(storage.stats().puts, 0);
			assert.equal(writesTo(mock, 'osionos_profiles').length, 0);
		});
	});

	it('refuses a variant that is not square, writing nothing', async () => {
		await avatarBridge(async ({ base, storage, mock }) => {
			const body = variantBody();
			body.variants['64'] = base64(webpFixture({ width: 64, height: 32 }));
			const result = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(body) });
			assert.equal(result.status, 422, result.text);
			assert.equal(storage.stats().puts, 0);
			assert.equal(writesTo(mock, 'osionos_profiles').length, 0);
		});
	});

	it('refuses a variant over its cap, writing nothing', async () => {
		await avatarBridge(async ({ base, storage, mock }) => {
			const body = variantBody();
			// A 460px variant padded past its 300KB cap: the bytes are still a WebP.
			body.variants['460'] = base64(Buffer.concat([webpFixture({ width: 460, height: 460 }), Buffer.alloc(300 * 1024, 7)]));
			const result = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(body) });
			assert.equal(result.status, 422, result.text);
			assert.equal(storage.stats().puts, 0);
			assert.equal(writesTo(mock, 'osionos_profiles').length, 0);
		});
	});

	it('refuses SVG and HTML bytes, writing nothing', async () => {
		await avatarBridge(async ({ base, storage, mock }) => {
			for (const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), htmlFixture()]) {
				const body = variantBody();
				body.variants['64'] = base64(bytes);
				const result = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(body) });
				assert.equal(result.status, 415, result.text);
			}
			assert.equal(storage.stats().puts, 0);
			assert.equal(writesTo(mock, 'osionos_profiles').length, 0);
		});
	});

	it('refuses a body that is neither the variants nor the legacy data URL', async () => {
		await avatarBridge(async ({ base, storage }) => {
			for (const body of [{}, { variants: {} }, { variants: { 64: 'x' } }, { variants: { ...variantBody().variants, 512: 'AAAA' } }]) {
				const result = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(body) });
				assert.equal(result.status, 422, result.text);
			}
			assert.equal(storage.stats().puts, 0);
		});
	});

	it('still accepts the legacy data URL of a cached client', async () => {
		await avatarBridge(async ({ base, storage, mock }) => {
			const result = await send(base, '/api/profile/avatar', asA, {
				method: 'POST',
				body: JSON.stringify({ dataUrl: `data:image/png;base64,${base64(pngFixture({ width: 8, height: 8 }))}` }),
			});
			assert.equal(result.status, 201, result.text);
			const keys = [...storage.objects.keys()].map((key) => key.split('/')[1]);
			assert.equal(keys.length, 1, keys.join(', '));
			assert.match(keys[0], /^[0-9a-f]{64}\.png$/);
			const patches = writesTo(mock, 'osionos_profiles');
			assert.equal(patches.length, 1);
			assert.equal(patches[0].body.avatar_url, `/api/media/avatars/${IDS.userA}/${keys[0]}`);
		});
	});

	it('refuses the eleventh upload of an hour', async () => {
		await avatarBridge(async ({ base }) => {
			let last = null;
			for (let run = 0; run < 11; run += 1) {
				last = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(variantBody()) });
			}
			assert.equal(last.status, 429, last.text);
		});
	});
});

describe('DELETE /api/profile/avatar', () => {
	it('clears the profile column AND the legacy blob', async () => {
		const identities = [{
			user_id: IDS.userA,
			display_name: 'Alice',
			profile: { avatar: 'data:image/png;base64,AAAA', headline: 'CTO' },
		}];
		await avatarBridge(async ({ base, mock }) => {
			const result = await send(base, '/api/profile/avatar', asA, { method: 'DELETE' });
			assert.equal(result.status, 204, result.text);

			const profilePatches = writesTo(mock, 'osionos_profiles');
			assert.equal(profilePatches.length, 1);
			assert.equal(profilePatches[0].body.avatar_url, null);

			const identityPatches = writesTo(mock, 'osionos_bridge_identities');
			assert.equal(identityPatches.length, 1);
			assert.equal('avatar' in identityPatches[0].body.profile, false);
			assert.equal(identityPatches[0].body.profile.headline, 'CTO', 'the rest of the blob stays');
		}, { identities });
	});
});

describe('GET /api/media/avatars/:userId/:key', () => {
	const sha = 'a'.repeat(64);

	it('serves the bytes with the sandbox headers and an immutable cache', async () => {
		await avatarBridge(async ({ base, storage }) => {
			const uploaded = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(variantBody()) });
			const key = uploaded.body.avatarPath.split('/').pop();
			const stored = storage.objects.get(`${IDS.userA}/${key}`);

			const res = await fetch(`${base}/api/media/avatars/${IDS.userA}/${key}`);
			assert.equal(res.status, 200);
			assert.equal(res.headers.get('content-type'), 'image/webp');
			assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
			assert.match(res.headers.get('content-security-policy') ?? '', /sandbox/);
			assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
			assert.ok(res.headers.get('etag'));
			assert.deepEqual(Buffer.from(await res.arrayBuffer()), stored.body);
		});
	});

	it('answers 304 on a matching ETag', async () => {
		await avatarBridge(async ({ base }) => {
			const uploaded = await send(base, '/api/profile/avatar', asA, { method: 'POST', body: JSON.stringify(variantBody()) });
			const key = uploaded.body.avatarPath.split('/').pop();
			const first = await fetch(`${base}/api/media/avatars/${IDS.userA}/${key}`);
			const etag = first.headers.get('etag');
			const second = await fetch(`${base}/api/media/avatars/${IDS.userA}/${key}`, { headers: { 'if-none-match': etag } });
			assert.equal(second.status, 304);
		});
	});

	it('answers 404 for a key that is not stored', async () => {
		await avatarBridge(async ({ base, storage }) => {
			const res = await fetch(`${base}/api/media/avatars/${IDS.userA}/${sha}-160.webp`);
			assert.equal(res.status, 404);
			assert.equal(storage.stats().gets, 1, 'the router was asked once');
		});
	});

	it('answers 404 for a key that does not match the pattern, without asking the router', async () => {
		await avatarBridge(async ({ base, storage }) => {
			for (const key of ['not-a-key', `${sha}.exe`, `${sha}-12.webp`, `${sha}-160.webp/../x`]) {
				const res = await fetch(`${base}/api/media/avatars/${IDS.userA}/${key}`);
				assert.equal(res.status, 404, key);
			}
			assert.equal(storage.stats().gets, 0, 'no storage call for a key that cannot exist');
		});
	});
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-upload-content-check.test.mjs                :::      :::    :::   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P0-6: the declared Content-Type is the type a stored object is SERVED with, so
// it must be the type the bytes are. The check lives in the shared writer
// (bridge-storage-core.mjs), so the page-media, chat and collaboration upload
// routes are covered at the root: a body of HTML declared `image/png` is refused
// before a byte is stored.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';
import { htmlFixture, pdfFixture, pngFixture, zipFixture } from './support/image-fixtures.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA);
const CHANNEL = 'c1c1c1c1-1111-4111-8111-c1c1c1c1c1c1';
const STORAGE_ORIGIN = 'http://storage.test';
const previousStorageUrl = process.env.STORAGE_ROUTER_URL;
process.env.STORAGE_ROUTER_URL = `${STORAGE_ORIGIN}/storage/v1`;

/** The storage router in memory: `puts` counts the writes that reached it. */
function fakeStorage() {
	const objects = new Map();
	const fake = async (input, init = {}) => {
		const method = (init.method || 'GET').toUpperCase();
		if (String(input).includes('/bucket/')) return new Response('{"created":false}', { status: 200 });
		const key = `${init.headers?.['x-user-id']}/${decodeURIComponent(/\/object\/[^/]+\/(.+)$/.exec(new URL(String(input)).pathname)[1])}`;
		if (method === 'PUT') {
			fake.puts += 1;
			objects.set(key, { body: Buffer.from(init.body), contentType: init.headers?.['content-type'] });
			return new Response('{"ok":true}', { status: 200 });
		}
		const stored = objects.get(key);
		return stored
			? new Response(stored.body, { status: 200, headers: { 'content-type': stored.contentType } })
			: new Response('missing', { status: 404 });
	};
	fake.puts = 0;
	fake.objects = objects;
	return fake;
}

function world() {
	return {
		osionos_workspaces: [{ id: IDS.team, owner_id: IDS.userA, name: 'Team', slug: 'team', visibility: 'private' }],
		osionos_workspace_members: [{ workspace_id: IDS.team, user_id: IDS.userA, role: 'owner', permissions: ['read', 'create'] }],
		osionos_channels: [{ id: CHANNEL, workspace_id: IDS.team, kind: 'text', name: 'General', is_private: false }],
	};
}

/** The BaaS mock and the storage router behind one fetch, as the bridge sees them. */
function bridgeWorld() {
	const mock = createPostgrestMock(world());
	const storage = fakeStorage();
	const fetchImpl = (input, init) => (String(input).startsWith(STORAGE_ORIGIN) ? storage(input, init) : mock.fetchImpl(input, init));
	return { fetchImpl, storage, mock };
}

const ROUTES = [
	{ name: 'page media', path: '/api/media/uploads?name=p.png' },
	{ name: 'chat', path: `/api/chat/uploads?channelId=${CHANNEL}&name=p.png&type=image` },
	{ name: 'collaboration', path: `/api/collaboration/${IDS.team}/uploads?name=p.png` },
];

async function upload(path, contentType, body) {
	const { fetchImpl, storage } = bridgeWorld();
	const result = await withBridge(config, fetchImpl, (base) => send(base, path, { ...asA, 'content-type': contentType }, { method: 'POST', body }));
	return { result, puts: storage.puts };
}

describe('an upload is checked against its bytes', () => {
	for (const route of ROUTES) {
		it(`${route.name}: HTML declared as an image is refused before storage`, async () => {
			const { result, puts } = await upload(route.path, 'image/png', htmlFixture());
			assert.equal(result.status, 415, result.text);
			assert.equal(puts, 0, 'no byte reached storage');
		});

		it(`${route.name}: a real PNG declared as a PNG is stored`, async () => {
			const { result, puts } = await upload(route.path, 'image/png', pngFixture());
			assert.equal(result.status, 201, result.text);
			assert.equal(puts, 1);
		});

		it(`${route.name}: a PDF is stored as an attachment`, async () => {
			const { result, puts } = await upload(route.path, 'application/pdf', pdfFixture());
			assert.equal(result.status, 201, result.text);
			assert.equal(puts, 1);
		});

		it(`${route.name}: a ZIP declared as opaque bytes is stored`, async () => {
			const { result, puts } = await upload(route.path, 'application/octet-stream', zipFixture());
			assert.equal(result.status, 201, result.text);
			assert.equal(puts, 1);
		});
	}
});

describe('a tail after the image is contained by the serve headers', () => {
	it('page media: a PNG with an HTML tail is served as image/png, sandboxed', async () => {
		const { fetchImpl, storage } = bridgeWorld();
		const tailed = Buffer.concat([pngFixture({ width: 4, height: 4 }), Buffer.from('<html><script>alert(1)</script></html>')]);
		await withBridge(config, fetchImpl, async (base) => {
			const upload = await send(base, '/api/media/uploads?name=t.png', { ...asA, 'content-type': 'image/png' }, { method: 'POST', body: tailed });
			assert.equal(upload.status, 201, upload.text);

			// The bytes are kept as they came: a phone appends data to a photo.
			const stored = [...storage.objects.values()][0];
			assert.equal(stored.body.includes(Buffer.from('<html>', 'latin1')), true, 'the tail is kept');

			// The capability URL serves it with the type of the PNG and no sniffing.
			const res = await fetch(`${base}${upload.body.media.url}`);
			assert.equal(res.status, 200);
			assert.equal(res.headers.get('content-type'), 'image/png');
			assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
			assert.match(res.headers.get('content-security-policy') ?? '', /sandbox/);
		});
	});
});

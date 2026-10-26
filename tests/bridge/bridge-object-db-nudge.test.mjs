// The object-database nudge names the tab that wrote, so that tab can skip the full
// refetch its own push would otherwise cause. The id is the client's own value, echoed
// only on the writer's own topic; a push without one publishes no `origin`.
// Caveat: the gateway is a local capture server speaking the HTTP publish contract; the
// ws:// publisher path (bridge-realtime-socket.mjs) carries the same payload untested here.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);
const published = [];
let gateway;
let previousUrl;

before(async () => {
	gateway = createServer((request, response) => {
		let body = '';
		request.on('data', (chunk) => { body += chunk; });
		request.on('end', () => {
			published.push(JSON.parse(body));
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end('{}');
		});
	});
	await new Promise((done) => gateway.listen(0, '127.0.0.1', done));
	previousUrl = process.env.REALTIME_PUBLISH_URL;
	process.env.REALTIME_PUBLISH_URL = `http://127.0.0.1:${gateway.address().port}`;
});

after(async () => {
	if (previousUrl === undefined) delete process.env.REALTIME_PUBLISH_URL;
	else process.env.REALTIME_PUBLISH_URL = previousUrl;
	await new Promise((done) => gateway.close(done));
});

/** The publish fires after the answer (best-effort), so wait for it to land. */
async function nextPublish(count) {
	for (let attempt = 0; attempt < 100 && published.length < count; attempt += 1) {
		await new Promise((done) => setTimeout(done, 10));
	}
	return published[count - 1];
}

describe('the object-database nudge', () => {
	it('carries the id of the tab that pushed', async () => {
		const mock = createPostgrestMock();
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/object-databases', asB, post({ dbKey: 'db-1', title: 'Catalog', state: {}, origin: 'a1b2c3d4e5f6a1b2c3d4e5f6' }));
			assert.equal(answer.status, 200, answer.text);
		});
		const event = await nextPublish(1);
		assert.equal(event.topic, `objectdb:${IDS.userB}`);
		assert.equal(event.event_type, 'objectdb_changed');
		assert.deepEqual(event.payload, { dbKey: 'db-1', userId: IDS.userB, origin: 'a1b2c3d4e5f6a1b2c3d4e5f6' });
	});

	it('publishes no origin for a push that names none, so every tab refetches as before', async () => {
		const mock = createPostgrestMock();
		await withBridge(config, mock.fetchImpl, async (base) => {
			await send(base, '/api/object-databases', asB, post({ dbKey: 'db-2', title: 'Catalog', state: {} }));
			await send(base, '/api/object-databases', asB, post({ dbKey: 'db-3', title: 'Catalog', state: {}, origin: { not: 'text' } }));
		});
		assert.deepEqual((await nextPublish(2)).payload, { dbKey: 'db-2', userId: IDS.userB });
		assert.deepEqual((await nextPublish(3)).payload, { dbKey: 'db-3', userId: IDS.userB });
	});

	it('bounds the echoed id to 64 characters', async () => {
		const mock = createPostgrestMock();
		await withBridge(config, mock.fetchImpl, async (base) => {
			await send(base, '/api/object-databases', asB, post({ dbKey: 'db-4', title: 'Catalog', state: {}, origin: 'x'.repeat(500) }));
		});
		assert.equal((await nextPublish(4)).payload.origin, 'x'.repeat(64));
	});
});

// A large JSON answer travels gzipped when the client accepts gzip, and stays plain
// otherwise. The largest live account's GET /api/object-databases is 2.7 MiB of JSON
// (measured 2026-10-26), re-downloaded after every write the client is nudged about.
// Caveat: the bodies here are synthetic repeated records, which compress better than
// real database state (2759 KiB → 335 KiB live, about 8×); the ratio asserted is 4×.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { IDS, createPostgrestMock, harnessConfig, sessionHeaders, withBridge } from './support/bridge-harness.mjs';
import { GZIP_MIN_CHARS, acceptsGzip, writeJsonResponse } from '../../scripts/bridge-json-response.mjs';
import { sendJson } from '../../scripts/bridge-social-core.mjs';

const config = harnessConfig();
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);

function bigState(records) {
	const pages = {};
	for (let index = 0; index < records; index += 1) {
		pages[`page-${index}`] = { id: `page-${index}`, properties: { title: `Product ${index}`, price: index * 3.5, notes: 'In stock, ships in two days.' } };
	}
	return { pages };
}

const seeded = (records) => ({
	osionos_object_databases: [{ id: 'row-1', owner_id: IDS.userB, workspace_id: null, db_key: 'db-catalog', title: 'Catalog', state: bigState(records) }],
});

/** A GET that keeps the raw bytes: fetch would decode gzip and hide what crossed the wire. */
function rawGet(base, path, headers) {
	return new Promise((resolve, reject) => {
		const outgoing = request(`${base}${path}`, { headers }, (incoming) => {
			const chunks = [];
			incoming.on('data', (chunk) => chunks.push(chunk));
			incoming.on('end', () => resolve({ status: incoming.statusCode, headers: incoming.headers, bytes: Buffer.concat(chunks) }));
			incoming.on('error', reject);
		});
		outgoing.on('error', reject);
		outgoing.end();
	});
}

async function withServer(handler, run) {
	const server = createServer(handler);
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	try {
		return await run(`http://127.0.0.1:${server.address().port}`);
	} finally {
		await new Promise((done) => server.close(done));
	}
}

describe('which clients get gzip', () => {
	it('reads the Accept-Encoding header the way RFC 9110 weighs it', () => {
		assert.equal(acceptsGzip('gzip, deflate, br, zstd'), true);
		assert.equal(acceptsGzip('br;q=1.0, gzip;q=0.8'), true);
		assert.equal(acceptsGzip('*'), true);
		assert.equal(acceptsGzip('GZIP'), true);
		assert.equal(acceptsGzip('gzip;q=0'), false);
		assert.equal(acceptsGzip('*;q=1, gzip;q=0'), false, 'an explicit gzip;q=0 beats the wildcard');
		assert.equal(acceptsGzip('gzip;q=nope'), false);
		assert.equal(acceptsGzip('br, deflate'), false);
		assert.equal(acceptsGzip(''), false);
		assert.equal(acceptsGzip(undefined), false);
	});
});

describe('GET /api/object-databases', () => {
	it('sends a large list gzipped to a client that accepts gzip, with the same JSON inside', async () => {
		const mock = createPostgrestMock(seeded(3000));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const plain = await rawGet(base, '/api/object-databases', asB);
			const zipped = await rawGet(base, '/api/object-databases', { ...asB, 'accept-encoding': 'gzip, deflate, br' });
			assert.equal(plain.status, 200);
			assert.equal(zipped.status, 200);
			assert.equal(plain.headers['content-encoding'], undefined);
			assert.equal(zipped.headers['content-encoding'], 'gzip');
			assert.deepEqual(JSON.parse(gunzipSync(zipped.bytes).toString('utf8')), JSON.parse(plain.bytes.toString('utf8')));
			assert.ok(zipped.bytes.length * 4 < plain.bytes.length, `${zipped.bytes.length} B gzipped vs ${plain.bytes.length} B plain`);
			assert.equal(JSON.parse(plain.bytes.toString('utf8')).databases[0].dbKey, 'db-catalog');
		});
	});

	it('tells caches the large answer depends on Accept-Encoding, whichever form it took', async () => {
		const mock = createPostgrestMock(seeded(3000));
		await withBridge(config, mock.fetchImpl, async (base) => {
			for (const encoding of [undefined, 'gzip']) {
				const answer = await rawGet(base, '/api/object-databases', encoding ? { ...asB, 'accept-encoding': encoding } : asB);
				assert.equal(answer.headers.vary, 'Origin, Accept-Encoding');
				assert.equal(answer.headers['access-control-allow-origin'], config.allowedOrigin);
				assert.equal(answer.headers['cache-control'], 'no-store');
			}
		});
	});

	it('keeps a large answer plain for a client that refuses gzip', async () => {
		const mock = createPostgrestMock(seeded(3000));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await rawGet(base, '/api/object-databases', { ...asB, 'accept-encoding': 'gzip;q=0, br' });
			assert.equal(answer.headers['content-encoding'], undefined);
			assert.equal(JSON.parse(answer.bytes.toString('utf8')).databases.length, 1);
		});
	});

	it('never compresses a small answer, so token and session replies stay plain', async () => {
		const mock = createPostgrestMock(seeded(2));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await rawGet(base, '/api/object-databases', { ...asB, 'accept-encoding': 'gzip' });
			assert.ok(answer.bytes.length < GZIP_MIN_CHARS, `${answer.bytes.length} B`);
			assert.equal(answer.headers['content-encoding'], undefined);
			assert.equal(answer.headers.vary, 'Origin');
			assert.equal(JSON.parse(answer.bytes.toString('utf8')).databases.length, 1);
		});
	});

	it('leaves a small error answer plain', async () => {
		const mock = createPostgrestMock(seeded(3000));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await rawGet(base, '/api/object-databases', { 'accept-encoding': 'gzip' });
			assert.equal(answer.status, 401);
			assert.equal(answer.headers['content-encoding'], undefined);
			assert.equal(JSON.parse(answer.bytes.toString('utf8')).ok, false);
		});
	});
});

describe('the shared writer', () => {
	const body = { items: Array.from({ length: 2000 }, (_, index) => ({ id: index, text: 'a message in a busy channel' })) };

	it('compresses the social routes too (sendJson)', async () => {
		await withServer((incoming, outgoing) => sendJson(outgoing, 200, body, { allowedOrigin: 'https://app.test' }), async (base) => {
			const answer = await rawGet(base, '/', { 'accept-encoding': 'gzip' });
			assert.equal(answer.headers['content-encoding'], 'gzip');
			assert.equal(answer.headers['access-control-allow-origin'], 'https://app.test');
			assert.deepEqual(JSON.parse(gunzipSync(answer.bytes).toString('utf8')), body);
		});
	});

	it('has sent its headers by the time it returns, as the plain writer always did', async () => {
		let sentBeforeReturn = null;
		await withServer((incoming, outgoing) => {
			writeJsonResponse(outgoing, 200, { 'content-type': 'application/json; charset=utf-8' }, body);
			sentBeforeReturn = outgoing.headersSent;
			assert.throws(() => outgoing.writeHead(500), { code: 'ERR_HTTP_HEADERS_SENT' });
		}, async (base) => {
			const answer = await rawGet(base, '/', { 'accept-encoding': 'gzip' });
			assert.equal(answer.status, 200);
			assert.deepEqual(JSON.parse(gunzipSync(answer.bytes).toString('utf8')), body);
		});
		assert.equal(sentBeforeReturn, true);
	});

	it('writes the plain body when there is no request to read the header from', () => {
		const written = {};
		const response = {
			writeHead: (status, headers) => Object.assign(written, { status, headers }),
			end: (payload) => Object.assign(written, { payload }),
		};
		writeJsonResponse(response, 200, { vary: 'Origin' }, body);
		assert.equal(written.status, 200);
		assert.equal(written.headers['content-encoding'], undefined);
		assert.deepEqual(JSON.parse(written.payload), body);
	});
});

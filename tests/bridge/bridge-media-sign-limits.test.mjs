// osionos#233 D233-10: the sign route is rate-limited per user (a 503 storm or a runaway client
// must not cost a JWT verify and a page read per render), and a call holds at most 200 paths.
// D233-4, server side: the answer carries the bridge's clock, so a client with a skewed clock
// still knows how long a link lives.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createMediaHandler } from '../../scripts/bridge-media.mjs';
import { harnessConfig } from './support/bridge-harness.mjs';

const SECRET = 'media-url-secret-for-tests-0123456789';
const USER = '6d6d6d6d-0000-4000-8000-00000000d233';
const OWN = `/api/media/uploads/${USER}/${'f'.repeat(64)}.png`;

describe('the sign route limits', { timeout: 60_000 }, () => {
	let server;
	let base;
	before(async () => {
		const saved = process.env.MEDIA_URL_SECRET;
		process.env.MEDIA_URL_SECRET = SECRET;
		const handle = createMediaHandler({ config: harnessConfig(), verifySession: () => ({ userId: USER }) });
		if (saved === undefined) delete process.env.MEDIA_URL_SECRET;
		else process.env.MEDIA_URL_SECRET = saved;
		server = createServer((request, response) => handle(new URL(request.url, 'http://bridge.example'), request, response));
		await new Promise((done) => server.listen(0, '127.0.0.1', done));
		base = `http://127.0.0.1:${server.address().port}`;
	});
	after(() => server.close());

	const sign = (paths) => fetch(`${base}/api/media/uploads/sign`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: 'Bearer user' },
		body: JSON.stringify({ paths }),
		signal: AbortSignal.timeout(10_000),
	});

	it('answers the bridge clock with the signed paths', async () => {
		const res = await sign([OWN]);
		assert.equal(res.status, 200);
		const body = await res.json();
		assert.ok(Math.abs(body.now - Date.now() / 1000) < 60, String(body.now));
		assert.ok(Number(new URL(body.signed[OWN], base).searchParams.get('exp')) - body.now >= 3600);
	});

	it('refuses more than 200 paths with a 413', async () => {
		assert.equal((await sign(Array.from({ length: 201 }, () => OWN))).status, 413);
	});

	it('answers 429 once a user is past the cap', async () => {
		const statuses = [];
		for (let call = 0; call < 130; call += 1) statuses.push((await sign([OWN])).status);
		assert.ok(statuses.includes(429), `no 429 in ${statuses.length} calls`);
		assert.ok(statuses.indexOf(429) >= 100, `429 after only ${statuses.indexOf(429)} calls`);
	});
});

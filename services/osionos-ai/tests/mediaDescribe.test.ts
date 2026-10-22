import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { GOOD_ANSWER, startMockVlm } from './mockVlm.ts';
import { gpsApp1, hasBytes, jpegBytes, pngBytes, svgBytes, webpBytes } from './visionFixtures.ts';

/**
 * "Describe image" (M7), end to end against a mock bridge and a mock VLM:
 * the bytes are fetched with the caller's token, checked, stripped, hashed;
 * the VLM is asked once per picture; the safety hint is stored and never sent.
 */
const vlm = await startMockVlm();
process.env.OSIONOS_AI_VLM_URL = vlm.baseUrl;
process.env.OSIONOS_AI_VLM_TIMEOUT_MS = '1500';
process.env.OSIONOS_AI_VLM_QUEUE_WAIT_MS = '400';
process.env.OSIONOS_AI_DESCRIBE_PER_MINUTE = '100';

const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');
const { app, mock, bridge, base, call, tokenFor } = await startHarness();
const token = tokenFor(USER_A, WORKSPACE_A);
const OWNER = '00000000-0000-4000-8000-0000000000aa';

let counter = 0;
/** Serves bytes at a fresh media path of the bridge and returns the path. */
function serve(bytes: Uint8Array, contentType = 'image/png', status = 200): string {
	counter += 1;
	const name = `${createHash('sha256').update(String(counter)).digest('hex')}.png`;
	const path = `/api/media/uploads/${OWNER}/${name}`;
	bridge.serve(path, { bytes, contentType, status });
	return path;
}

const describePath = (path: string, withToken: string | undefined = token) =>
	call('/api/ai/media/describe', { method: 'POST', token: withToken, body: { path } });

const rawDescribe = (path: string) =>
	fetch(`${base}/api/ai/media/describe`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ path }),
	});

before(async () => {
	await app.db.query('delete from public.ai_media_annotations');
});
after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await vlm.close();
});

describe('POST /api/ai/media/describe', () => {
	it('returns caption, tags, objects and ocr, normalised, and no safety', async () => {
		const answer = await describePath(serve(pngBytes({ width: 11, height: 11 })));
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, {
			caption: GOOD_ANSWER.caption,
			tags: ['bicycle', 'wall', 'street'],
			objects: ['bicycle', 'wall'],
			ocr: 'BIKE SHOP',
		});
		assert.ok(!JSON.stringify(answer.body).includes('safety'));
	});

	it('stores the safety hint and the result under (sha256 of the stripped bytes, model, revision)', async () => {
		const bytes = pngBytes({ width: 12, height: 12 });
		await describePath(serve(bytes));
		const sha = createHash('sha256').update(bytes).digest('hex');
		const rows = await app.db.query('select model, revision, result from public.ai_media_annotations where sha256 = $1', [sha]);
		assert.equal(rows.rowCount, 1);
		assert.equal(rows.rows[0].result.safety, 'safe');
		assert.match(rows.rows[0].revision, /^[0-9a-f]{40}$/);
	});

	it('the second request for the same bytes is a cache hit: one VLM call in total', async () => {
		const bytes = pngBytes({ width: 13, height: 13 });
		const before = vlm.bodies.length;
		const first = await describePath(serve(bytes));
		const second = await describePath(serve(bytes));
		assert.equal(first.status, 200);
		assert.deepEqual(second.body, first.body);
		assert.equal(vlm.bodies.length - before, 1);
	});

	it('sends the schema, temperature 0, max_tokens 640 and the stripped bytes as a data URL; no capability path', async () => {
		const exif = jpegBytes({ width: 14, height: 14, app1: gpsApp1() });
		assert.ok(hasBytes(exif, 'Exif'));
		const path = serve(exif, 'image/jpeg');
		await describePath(path);
		const body = vlm.bodies.at(-1) as Record<string, any>;
		assert.equal(body.temperature, 0);
		assert.equal(body.max_tokens, 640);
		assert.equal(body.response_format.type, 'json_schema');
		assert.equal(body.response_format.json_schema.strict, true);
		const parts = body.messages[0].content as { type: string; image_url?: { url: string }; text?: string }[];
		const url = parts.find((part) => part.type === 'image_url')?.image_url?.url ?? '';
		assert.match(url, /^data:image\/jpeg;base64,/);
		const sent = Buffer.from(url.split(',')[1], 'base64');
		assert.ok(!hasBytes(new Uint8Array(sent), 'Exif'), 'EXIF is gone from the bytes the VLM receives');
		assert.ok(!JSON.stringify(body).includes('/api/media/uploads'), 'no capability path in the body');
	});

	it('refuses a GIF, an SVG and a text file before any VLM call', async () => {
		const before = vlm.bodies.length;
		const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]);
		for (const [bytes, type] of [[gif, 'image/gif'], [svgBytes(), 'image/svg+xml'], [new TextEncoder().encode('hello world'), 'text/plain']] as const) {
			const answer = await describePath(serve(bytes, type));
			assert.equal(answer.status, 422);
			assert.equal(answer.body?.code, 'invalid_image');
		}
		assert.equal(vlm.bodies.length, before);
	});

	it('refuses a picture over the pixel cap before the VLM', async () => {
		const before = vlm.bodies.length;
		const answer = await describePath(serve(pngBytes({ width: 5000, height: 5000 })));
		assert.equal(answer.status, 422);
		assert.equal(answer.body?.code, 'image_too_large');
		assert.equal(vlm.bodies.length, before);
	});

	it('accepts a webp', async () => {
		const answer = await describePath(serve(webpBytes({ width: 15, height: 15 }), 'image/webp'));
		assert.equal(answer.status, 200);
	});

	it('a VLM answer that is not JSON is a 502 vlm_bad_answer and nothing is cached', async () => {
		const bytes = pngBytes({ width: 16, height: 16 });
		const sha = createHash('sha256').update(bytes).digest('hex');
		vlm.content = 'I think it is a bicycle.';
		const answer = await describePath(serve(bytes));
		vlm.content = JSON.stringify(GOOD_ANSWER);
		assert.equal(answer.status, 502);
		assert.equal(answer.body?.code, 'vlm_bad_answer');
		const rows = await app.db.query('select 1 from public.ai_media_annotations where sha256 = $1', [sha]);
		assert.equal(rows.rowCount, 0);
	});

	it('a JSON answer that misses the schema is a 502 too', async () => {
		vlm.content = JSON.stringify({ ...GOOD_ANSWER, safety: 'maybe' });
		const answer = await describePath(serve(pngBytes({ width: 17, height: 17 })));
		vlm.content = JSON.stringify(GOOD_ANSWER);
		assert.equal(answer.status, 502);
	});

	it('a VLM that does not answer in time is a 503 vlm_unavailable with Retry-After', async () => {
		vlm.delayMs = 3000;
		const answer = await rawDescribe(serve(pngBytes({ width: 18, height: 18 })));
		vlm.delayMs = 0;
		assert.equal(answer.status, 503);
		assert.equal(((await answer.json()) as { code: string }).code, 'vlm_unavailable');
		assert.ok(Number(answer.headers.get('retry-after')) > 0);
	});

	it('a 403 of the bridge is a 404 attachment_not_found', async () => {
		const answer = await describePath(serve(pngBytes(), 'image/png', 403));
		assert.equal(answer.status, 404);
		assert.equal(answer.body?.code, 'attachment_not_found');
	});

	it('no session is a 401, and a path that is not a media path is a 400', async () => {
		assert.equal((await describePath(serve(pngBytes({ width: 19, height: 19 })), '')).status, 401);
		assert.equal((await describePath('/api/chat/uploads/x')).status, 400);
		assert.equal((await describePath('https://evil.example/a.png')).status, 400);
	});

	it('two parallel describes never put two calls in flight on the VLM', async () => {
		vlm.delayMs = 250;
		const before = vlm.bodies.length;
		const [one, two] = await Promise.all([
			describePath(serve(pngBytes({ width: 20, height: 20 }))),
			describePath(serve(pngBytes({ width: 21, height: 21 }))),
		]);
		vlm.delayMs = 0;
		assert.deepEqual([one.status, two.status], [200, 200]);
		assert.equal(vlm.bodies.length - before, 2);
		assert.equal(vlm.maxInFlight, 1);
	});

	it('a request that waits longer than the queue allows is a 429 with Retry-After', async () => {
		vlm.delayMs = 900;
		const holder = describePath(serve(pngBytes({ width: 22, height: 22 })));
		await new Promise((resolve) => setTimeout(resolve, 100));
		const waiter = await rawDescribe(serve(pngBytes({ width: 23, height: 23 })));
		assert.equal(waiter.status, 429);
		assert.equal(((await waiter.json()) as { code: string }).code, 'vlm_busy');
		assert.ok(Number(waiter.headers.get('retry-after')) > 0);
		vlm.delayMs = 0;
		await holder;
	});
});

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { answerWithOrigin } from '../src/corsOrigin.ts';

/**
 * The service answers the desktop app (app://osionos) and a local dev server with their own
 * origin. With one fixed origin the desktop app's AI connections read as "Failed to fetch"
 * and the chat said no connection was set up (2026-10-30, live stack).
 */
const STATIC_ORIGIN = 'https://web.example';

const server = createServer((request, response) => {
	answerWithOrigin(request, response);
	if (request.url === '/set-header') {
		response.setHeader('access-control-allow-origin', STATIC_ORIGIN);
		response.end('{}');
		return;
	}
	response.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': STATIC_ORIGIN });
	response.end('{}');
});
let base = '';
before(async () => {
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const originOf = async (path: string, origin: string) =>
	(await fetch(base + path, { headers: { origin } })).headers.get('access-control-allow-origin');

describe('the CORS origin of a reply', () => {
	for (const origin of ['app://osionos', 'http://127.0.0.1:5173', 'http://localhost:3001', 'tauri://localhost']) {
		it(`names ${origin} when it calls`, async () => {
			assert.equal(await originOf('/', origin), origin);
			assert.equal(await originOf('/set-header', origin), origin);
		});
	}
	it('keeps the configured origin for an unlisted caller', async () => {
		assert.equal(await originOf('/', 'https://evil.example'), STATIC_ORIGIN);
		assert.equal(await originOf('/set-header', 'app://osionos.evil.example'), STATIC_ORIGIN);
	});
});

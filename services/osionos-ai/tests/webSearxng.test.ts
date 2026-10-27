import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { SEARCH_DEADLINE_MS, SEARCH_MAX_BYTES, searxngSearch } from '../src/web/searxng.ts';

/** The SearXNG client against a fake service on 127.0.0.1 (web C351). */
let targetHits = 0;
let lastUrl = '';
const server = createServer((request, response) => {
	const path = request.url ?? '';
	if (path.startsWith('/target')) {
		targetHits += 1;
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end('{"results":[]}');
		return;
	}
	lastUrl = path;
	if (path.startsWith('/redirect/search')) {
		response.writeHead(302, { location: `http://${request.headers.host}/target` });
		response.end();
	} else if (path.startsWith('/html/search')) {
		response.writeHead(200, { 'content-type': 'text/html' });
		response.end('<html></html>');
	} else if (path.startsWith('/big/search')) {
		response.writeHead(200, { 'content-type': 'application/json' });
		response.write('{"results":["');
		response.end('a'.repeat(SEARCH_MAX_BYTES + 10) + '"]}');
	} else if (path.startsWith('/slow/search')) {
		response.writeHead(200, { 'content-type': 'application/json' });
		response.write('{"results":[');
	} else if (path.startsWith('/error/search')) {
		response.writeHead(500, { 'content-type': 'application/json' });
		response.end('{"error":"SECRET-UPSTREAM-DETAIL leaked-query"}');
	} else if (path.startsWith('/shape/search')) {
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end('{"nothing":1}');
	} else {
		response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
		response.end('{"results":[{"url":"https://example.com/"}]}');
	}
});
let base = '';
before(async () => {
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
	server.closeAllConnections();
	server.close();
});

async function failureOf(promise: Promise<unknown>): Promise<Error> {
	try {
		await promise;
	} catch (error) {
		return error as Error;
	}
	throw new Error('expected a failure');
}

describe('searxngSearch', () => {
	it('C351 returns the raw results with only the fixed parameters', async () => {
		const results = await searxngSearch('hello world & more', { baseUrl: `${base}/ok` });
		assert.equal(results.length, 1);
		const params = new URL(lastUrl, base).searchParams;
		assert.deepEqual([...params.keys()].sort(), ['format', 'pageno', 'q', 'safesearch']);
		assert.equal(params.get('q'), 'hello world & more');
		assert.equal(params.get('format'), 'json');
		assert.equal(params.get('safesearch'), '1');
		assert.equal(params.get('pageno'), '1');
	});

	it('C351 a 302 is not followed: the redirect target sees no hit', async () => {
		targetHits = 0;
		const error = await failureOf(searxngSearch('q', { baseUrl: `${base}/redirect` }));
		assert.equal(targetHits, 0);
		assert.equal(error.message, 'web_unreachable');
	});

	it('C351 a body that is not application/json is refused', async () => {
		const error = await failureOf(searxngSearch('q', { baseUrl: `${base}/html` }));
		assert.equal(error.message, 'web_protocol');
	});

	it('C351 a body past the cap is cut as web_too_large', async () => {
		const error = await failureOf(searxngSearch('q', { baseUrl: `${base}/big` }));
		assert.equal(error.message, 'web_too_large');
	});

	it('C351 a body that never ends times out, and the default deadline is 8000 ms', async () => {
		assert.equal(SEARCH_DEADLINE_MS, 8000);
		const error = await failureOf(searxngSearch('q', { baseUrl: `${base}/slow`, deadlineMs: 150 }));
		assert.equal(error.message, 'web_timeout');
	});

	it('C351 a server error body never appears in the error: message is the code', async () => {
		const error = await failureOf(searxngSearch('leaked-query', { baseUrl: `${base}/error` }));
		assert.equal(error.message, 'web_protocol');
		assert.equal(error.cause, undefined);
	});

	it('C351 JSON without a results array is web_protocol', async () => {
		const error = await failureOf(searxngSearch('q', { baseUrl: `${base}/shape` }));
		assert.equal(error.message, 'web_protocol');
	});

	it('C351 an unreachable service is web_unreachable with no raw text', async () => {
		const error = await failureOf(searxngSearch('q', { baseUrl: 'http://127.0.0.1:1' }));
		assert.equal(error.message, 'web_unreachable');
	});

	it('C351 a caller abort is a fixed code too', async () => {
		const error = await failureOf(
			searxngSearch('q', { baseUrl: `${base}/slow`, signal: AbortSignal.abort() }),
		);
		assert.equal(error.message, 'web_unreachable');
	});
});

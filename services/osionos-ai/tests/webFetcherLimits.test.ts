import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TestContext } from 'node:test';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { config } from '../src/config.ts';
import { DEFAULT_DEADLINE_MS, fetchPage, MAX_BODY_BYTES } from '../src/web/fetcher.ts';
import type { FetchOptions } from '../src/web/fetcher.ts';
import { RobotsCache } from '../src/web/robots.ts';
import { failureOf, FakeWeb, html, redirect, robotsTxt, routes } from './webFakeHosts.ts';
import type { Handler } from './webFakeHosts.ts';

/**
 * The limits of the page fetcher (web C344, C345): the headers it sends, the
 * one deadline, the cap on decoded bytes, and the socket closed after every
 * outcome that ends a response early.
 */
function fakeWeb(t: TestContext): FakeWeb {
	const web = new FakeWeb();
	t.after(() => web.close());
	return web;
}

function run(web: FakeWeb, url: string, options: FetchOptions = {}) {
	return fetchPage(new URL(url), { fetchImpl: web.fetchImpl, robots: new RobotsCache(), ...options });
}

const BOMB = Buffer.alloc(64 * 1024 * 1024);

/** Writes until the client goes away: only a closed socket stops it. */
const endless: Handler = (_request, response) => {
	response.writeHead(200, { 'content-type': 'text/html' });
	const chunk = Buffer.alloc(64 * 1024, 0x61);
	const pump = () => {
		while (response.write(chunk));
		response.once('drain', pump);
	};
	pump();
};

describe('web C344 the request on the wire', () => {
	// What undici adds to every fetch on its own. None says anything about the
	// user, the run or the network: host and connection are the transport,
	// accept-language is the fetch-spec default "*", sec-fetch-mode its CORS tag.
	const UNDICI_EXTRAS = ['accept-language', 'connection', 'host', 'sec-fetch-mode'];
	const OURS = ['accept', 'accept-encoding', 'user-agent'];

	it('C344 the raw request carries our three headers and only undici\'s transport extras', async (t) => {
		const web = fakeWeb(t);
		await web.host('hdr.test', routes({ '/p': html('<p>x</p>') }));
		await run(web, 'https://hdr.test/p');
		assert.equal(web.seen.length, 2, 'robots.txt and the page');
		for (const seen of web.seen) {
			const names = seen.rawHeaders.filter((_value, index) => index % 2 === 0).map((name) => name.toLowerCase());
			assert.deepEqual([...names].sort(), [...OURS, ...UNDICI_EXTRAS].sort(), seen.url);
			const headers = Object.fromEntries(seen.rawHeaders.reduce<string[][]>((pairs, value, index) => (index % 2 ? (pairs.at(-1)?.push(value), pairs) : [...pairs, [value.toLowerCase()]]), []));
			assert.equal(headers['user-agent'], `osionos-assistant/1 (+${config.webContactUrl})`);
			assert.equal(headers['accept-encoding'], 'gzip, deflate, br');
			for (const forbidden of ['cookie', 'authorization', 'referer', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'forwarded', 'via']) {
				assert.ok(!(forbidden in headers), `${forbidden} must never be sent`);
			}
		}
		console.log('C344 captured header names:', web.seen[1].rawHeaders.filter((_value, index) => index % 2 === 0).join(', '));
	});
});

describe('web C345 one deadline, one cap, no socket left', () => {
	it('C345 the defaults are 10 s and 2 MiB', () => {
		assert.equal(DEFAULT_DEADLINE_MS, 10_000);
		assert.equal(MAX_BODY_BYTES, 2 * 1024 * 1024);
	});

	for (const [encoding, compress] of [
		['gzip', gzipSync],
		['br', brotliCompressSync],
	] as const) {
		it(`C345 a ${encoding} bomb of 64 MiB, small on the wire, is cut at the cap`, async (t) => {
			const web = fakeWeb(t);
			const wire = compress(BOMB);
			assert.ok(wire.byteLength < MAX_BODY_BYTES, 'the wire size passes a content-length check');
			await web.host(
				'bomb.test',
				routes({
					'/b': (_request, response) => {
						response.writeHead(200, { 'content-type': 'text/html', 'content-encoding': encoding });
						response.end(wire);
					},
				}),
			);
			assert.equal((await failureOf(run(web, 'https://bomb.test/b'))).code, 'web_too_large');
			assert.ok(await web.socketsClosed());
		});
	}

	it('C345 an endless stream is cut at the cap and its socket closed', async (t) => {
		const web = fakeWeb(t);
		await web.host('endless.test', routes({ '/e': endless }));
		assert.equal((await failureOf(run(web, 'https://endless.test/e'))).code, 'web_too_large');
		assert.ok(await web.socketsClosed());
	});

	it('C345 a content-length over the cap refuses before a byte of body is read', async (t) => {
		const web = fakeWeb(t);
		await web.host(
			'lie.test',
			routes({
				'/l': (_request, response) => {
					response.writeHead(200, { 'content-type': 'text/html', 'content-length': String(MAX_BODY_BYTES + 1) });
					response.write('x');
				},
			}),
		);
		assert.equal((await failureOf(run(web, 'https://lie.test/l'))).code, 'web_too_large');
		assert.ok(await web.socketsClosed());
	});

	it('C345 maxBytes is honoured: a 1 KiB page over a 100-byte cap is too large', async (t) => {
		const web = fakeWeb(t);
		await web.host('small.test', routes({ '/s': html('x'.repeat(1024)) }));
		assert.equal((await failureOf(run(web, 'https://small.test/s', { maxBytes: 100 }))).code, 'web_too_large');
	});

	it('C345 a body that drips past the deadline is a timeout and its socket closed', async (t) => {
		const web = fakeWeb(t);
		await web.host(
			'drip.test',
			routes({
				'/d': (_request, response) => {
					response.writeHead(200, { 'content-type': 'text/html' });
					const timer = setInterval(() => response.write('x'), 50);
					response.on('close', () => clearInterval(timer));
				},
			}),
		);
		const started = Date.now();
		assert.equal((await failureOf(run(web, 'https://drip.test/d', { deadlineMs: 400 }))).code, 'web_timeout');
		assert.ok(Date.now() - started < 2000, 'the deadline, not the drip, ends it');
		assert.ok(await web.socketsClosed());
	});

	it('C345 the deadline is ONE for every hop, not one per hop', async (t) => {
		const web = fakeWeb(t);
		const slowRedirect = (to: string): Handler => (_request, response) => {
			setTimeout(() => redirect(to)(_request, response), 250);
		};
		await web.host('h1.test', routes({ '/': slowRedirect('https://h2.test/') }));
		await web.host('h2.test', routes({ '/': slowRedirect('https://h3.test/') }));
		await web.host('h3.test', routes({ '/': slowRedirect('https://h4.test/') }));
		await web.host('h4.test', routes({ '/': (_request, response) => setTimeout(() => html('<p>end</p>')(_request, response), 250) }));
		// Each hop is 250 ms, far under 700; the four together are not.
		assert.equal((await failureOf(run(web, 'https://h1.test/', { deadlineMs: 700 }))).code, 'web_timeout');
		assert.equal((await run(web, 'https://h1.test/', { deadlineMs: 5000 })).text, 'end');
	});

	it('C345 a slow robots.txt spends the same deadline and is a timeout, not a refusal', async (t) => {
		const web = fakeWeb(t);
		await web.host(
			'slowrobots.test',
			routes({
				'/robots.txt': (request, response) => setTimeout(() => robotsTxt('')(request, response), 400),
				'/': html('<p>x</p>'),
			}),
		);
		assert.equal((await failureOf(run(web, 'https://slowrobots.test/', { deadlineMs: 150 }))).code, 'web_timeout');
	});

	it('C345 the caller\'s abort ends the call and closes the socket', async (t) => {
		const web = fakeWeb(t);
		await web.host('stop.test', routes({ '/e': endless }));
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 100);
		await failureOf(run(web, 'https://stop.test/e', { signal: controller.signal, maxBytes: 1024 * 1024 * 1024 }));
		assert.ok(await web.socketsClosed());
	});
});

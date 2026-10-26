import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TestContext } from 'node:test';
import { WebFailure } from '../src/web/failure.ts';
import type { WebFailureCode } from '../src/web/failure.ts';
import { fetchPage, MAX_REDIRECTS } from '../src/web/fetcher.ts';
import type { FetchOptions } from '../src/web/fetcher.ts';
import { RobotsCache } from '../src/web/robots.ts';
import { failureOf, FakeWeb, html, redirect, robotsTxt, routes } from './webFakeHosts.ts';

/**
 * The page fetcher's flow (web C341, C342, C346, C368, C373) against real
 * sockets. Limits, headers and the guard are in webFetcherLimits.test.ts and
 * webFetcherGuard.test.ts.
 */

function fakeWeb(t: TestContext): FakeWeb {
	const web = new FakeWeb();
	t.after(() => web.close());
	return web;
}

/** A fresh robots cache per call: the module-level one would leak between tests. */
function run(web: FakeWeb, url: string, options: FetchOptions = {}) {
	return fetchPage(new URL(url), { fetchImpl: web.fetchImpl, robots: new RobotsCache(), ...options });
}

async function expectCode(call: Promise<unknown>, code: WebFailureCode): Promise<void> {
	assert.equal((await failureOf(call)).code, code);
}

describe('web C346 what a page becomes', () => {
	it('C346 an html page gives title, text, links and sizes, after robots.txt', async (t) => {
		const web = fakeWeb(t);
		await web.host(
			'news.test',
			routes({
				'/a': html('<title>T &amp; U</title><body><h1>Hello</h1><p>World <a href="/b">b</a> <a href="http://x.test/">no</a></p>'),
			}),
		);
		const page = await run(web, 'https://news.test/a');
		assert.equal(page.url, 'https://news.test/a');
		assert.equal(page.title, 'T & U');
		assert.equal(page.text, 'Hello\nWorld b no');
		assert.deepEqual(page.links, ['https://news.test/b']);
		assert.ok(page.bytes > 50 && page.ms >= 0);
		assert.deepEqual(
			web.seen.map((seen) => seen.url),
			['/robots.txt', '/a'],
		);
	});

	it('C346 text/plain is text, never parsed as tags, and has no links', async (t) => {
		const web = fakeWeb(t);
		await web.host(
			'notes.test',
			routes({
				'/n': (_request, response) => {
					response.writeHead(200, { 'content-type': 'text/plain' });
					response.end('a <b> c\nline two https://x.test/');
				},
			}),
		);
		const page = await run(web, 'https://notes.test/n');
		assert.equal(page.text, 'a ‹b> c\nline two https://x.test/');
		assert.deepEqual(page.links, []);
	});

	for (const type of ['image/png', 'application/json', 'application/pdf', 'text/xml', null]) {
		it(`C346 content type ${type ?? '(missing)'} is refused and its body is never read`, async (t) => {
			const web = fakeWeb(t);
			await web.host(
				'bin.test',
				routes({
					'/f': (_request, response) => {
						response.writeHead(200, type ? { 'content-type': type } : {});
						response.write(Buffer.alloc(256 * 1024));
						// Never ended: only a client that cancels frees this socket.
					},
				}),
			);
			await expectCode(run(web, 'https://bin.test/f'), 'web_content_type');
			assert.ok(await web.socketsClosed(), 'the unread body must not keep the socket open');
		});
	}

	it('C346 the declared charset is honoured for iso-8859-1 and windows-1252, anything else is utf-8', async (t) => {
		const web = fakeWeb(t);
		const send = (type: string, bytes: Buffer) => (_request: unknown, response: import('node:http').ServerResponse) => {
			response.writeHead(200, { 'content-type': type });
			response.end(bytes);
		};
		await web.host(
			'enc.test',
			routes({
				'/latin': send('text/html; charset=ISO-8859-1', Buffer.from([0x63, 0x61, 0x66, 0xe9])),
				'/cp': send('text/html; charset="windows-1252"', Buffer.from([0x80])),
				'/sjis': send('text/html; charset=shift_jis', Buffer.from([0x61, 0x82, 0xa0])),
				'/bad': send('text/html', Buffer.from([0x61, 0xff, 0xfe, 0x62])),
			}),
		);
		assert.equal((await run(web, 'https://enc.test/latin')).text, 'café');
		assert.equal((await run(web, 'https://enc.test/cp')).text, '€');
		assert.equal((await run(web, 'https://enc.test/sjis')).text, 'a��');
		assert.equal((await run(web, 'https://enc.test/bad')).text, 'a��b');
	});
});

describe('web C341 C342 the input and every hop', () => {
	const REFUSED_INPUTS = [
		'http://a.test/',
		'https://127.0.0.1/',
		'https://[::1]/',
		'https://[::ffff:7f00:1]/',
		'https://a.test:8443/',
		'https://localhost/',
		'https://intranet/',
		'https://user:p@a.test/',
	];
	for (const input of REFUSED_INPUTS) {
		it(`C341 the input ${input} is refused before any request`, async () => {
			let calls = 0;
			const fetchImpl = async () => {
				calls += 1;
				throw new Error('must not be called');
			};
			await expectCode(fetchPage(new URL(input), { fetchImpl, robots: new RobotsCache() }), 'web_unreachable');
			assert.equal(calls, 0);
		});
	}

	const REFUSED_LOCATIONS: (string | null)[] = [
		null,
		'http://b.test/',
		'https://127.0.0.1/',
		'https://[::1]/',
		'https://2130706433/',
		'https://intranet/',
		'https://b.test:8443/',
		'https://user:p@b.test/',
		'javascript:alert(1)',
		'ftp://b.test/',
		'file:///etc/passwd',
	];
	for (const location of REFUSED_LOCATIONS) {
		it(`C341 C342 a redirect to ${location ?? '(no Location)'} is refused and never contacted`, async (t) => {
			const web = fakeWeb(t);
			await web.host('a.test', routes({ '/': redirect(location) }));
			await web.host('b.test', routes({ '/': html('reached') }));
			await expectCode(run(web, 'https://a.test/'), 'web_redirect_refused');
			assert.deepEqual([...new Set(web.contacted)], ['a.test'], 'only the first host was ever called');
		});
	}

	it('C342 follows three redirects, resolving each Location against the URL it came from', async (t) => {
		const web = fakeWeb(t);
		await web.host(
			'a.test',
			routes({
				'/h0': redirect('/h1'),
				'/h1': redirect('//b.test/h2?x=1#frag'),
			}),
		);
		await web.host('b.test', routes({ '/h2': redirect('h3'), '/h3': html('<p>done</p>') }));
		const page = await run(web, 'https://a.test/h0');
		assert.equal(MAX_REDIRECTS, 3);
		assert.equal(page.url, 'https://b.test/h3');
		assert.equal(page.text, 'done');
	});

	it('C342 a fourth redirect is refused and its target is never requested', async (t) => {
		const web = fakeWeb(t);
		await web.host(
			'a.test',
			routes({ '/h0': redirect('/h1'), '/h1': redirect('/h2'), '/h2': redirect('/h3'), '/h3': redirect('/h4'), '/h4': html('too far') }),
		);
		await expectCode(run(web, 'https://a.test/h0'), 'web_redirect_refused');
		assert.ok(!web.seen.some((seen) => seen.url === '/h4'));
		assert.equal(web.seen.filter((seen) => seen.url !== '/robots.txt').length, 4);
	});

	it('C342 the robots.txt of the new host is read, and a disallow there stops the hop', async (t) => {
		const web = fakeWeb(t);
		await web.host('a.test', routes({ '/': redirect('https://b.test/private/x') }));
		await web.host('b.test', routes({ '/robots.txt': robotsTxt('User-agent: *\nDisallow: /private/'), '/private/x': html('secret') }));
		await expectCode(run(web, 'https://a.test/'), 'web_robots_disallowed');
		assert.deepEqual(
			web.seen.filter((seen) => seen.host === 'b.test').map((seen) => seen.url),
			['/robots.txt'],
		);
	});
});

describe('web C368 C373 failures and no cache', () => {
	it('C368 an upstream error body never reaches the failure', async (t) => {
		const web = fakeWeb(t);
		await web.host(
			'boom.test',
			routes({
				'/x': (_request, response) => {
					response.writeHead(500, { 'content-type': 'text/plain', 'x-secret': 'HEADER-SECRET' });
					response.end('SECRET-UPSTREAM-BODY');
				},
			}),
		);
		const failure = await failureOf(run(web, 'https://boom.test/x'));
		assert.equal(failure.code, 'web_unreachable');
		const everything = `${failure.stack}${JSON.stringify(failure)}${String(failure)}`;
		assert.ok(!everything.includes('SECRET'));
	});

	it('C368 the message and the cause of a thrown error never reach the failure', async () => {
		const fetchImpl = async () => {
			throw Object.assign(new Error('getaddrinfo secret-detail 10.9.8.7'), { cause: new Error('inner-secret') });
		};
		const failure = await failureOf(fetchPage(new URL('https://x.test/'), { fetchImpl, robots: new RobotsCache() }));
		// The robots fetch is the first to fail: a site we cannot ask is a refusal.
		assert.equal(failure.code, 'web_robots_disallowed');
		const seeded = new RobotsCache();
		seeded.set('https://x.test', { allows: () => true });
		const page = await failureOf(fetchPage(new URL('https://x.test/'), { fetchImpl, robots: seeded }));
		assert.equal(page.code, 'web_unreachable');
		assert.ok(!`${page.stack}${JSON.stringify(page)}`.includes('secret'));
	});

	it('C368 a decode failure that is not network, size or time is web_protocol', async (t) => {
		const web = fakeWeb(t);
		await web.host(
			'zip.test',
			routes({
				'/x': (_request, response) => {
					response.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
					response.end(Buffer.from('this is not gzip at all, SECRET-GZIP'));
				},
			}),
		);
		await expectCode(run(web, 'https://zip.test/x'), 'web_protocol');
	});

	it('C373 two fetches of one URL are two outbound requests', async (t) => {
		const web = fakeWeb(t);
		await web.host('p.test', routes({ '/page': html('<p>same</p>') }));
		const robots = new RobotsCache();
		await run(web, 'https://p.test/page', { robots });
		await run(web, 'https://p.test/page', { robots });
		assert.equal(web.seen.filter((seen) => seen.url === '/page').length, 2);
	});

	it('C373 beforeRequest runs before every outbound request, robots and each hop', async (t) => {
		const web = fakeWeb(t);
		await web.host('a.test', routes({ '/': redirect('https://b.test/') }));
		await web.host('b.test', routes({ '/': html('<p>b</p>') }));
		const kinds: string[] = [];
		await run(web, 'https://a.test/', { beforeRequest: (kind) => void kinds.push(kind) });
		assert.deepEqual(kinds, ['robots', 'page', 'robots', 'page']);
		assert.equal(web.seen.length, kinds.length);
	});

	for (const stop of ['robots', 'page'] as const) {
		it(`C373 a ${stop} request the caller refuses is never sent, with the caller's own code`, async (t) => {
			const web = fakeWeb(t);
			await web.host('p.test', routes({ '/': html('<p>x</p>') }));
			const beforeRequest = (kind: string) => {
				if (kind === stop) throw new WebFailure('web_rate_limited');
			};
			await expectCode(run(web, 'https://p.test/', { beforeRequest }), 'web_rate_limited');
			assert.equal(web.seen.filter((seen) => seen.url !== '/robots.txt').length, 0);
		});
	}
});

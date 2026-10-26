import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TestContext } from 'node:test';
import { fetchPage } from '../src/web/fetcher.ts';
import { checkRobots, parseRobots, patternMatches, RobotsCache, ROBOTS_ALLOW_ALL, ROBOTS_MAX_BYTES, ROBOTS_MAX_ORIGINS, ROBOTS_TTL_MS } from '../src/web/robots.ts';
import { failureOf, FakeWeb, html, redirect, robotsTxt, routes } from './webFakeHosts.ts';
import type { Handler } from './webFakeHosts.ts';

/**
 * robots.txt (web C366): RFC 9309 matching, and what each way of failing to
 * read it means. "Could not find out" is a refusal; only a clean 4xx is a yes.
 */
function allows(text: string, target: string): boolean {
	const policy = parseRobots(text);
	assert.ok(policy, 'the text must parse');
	return policy.allows(target);
}

describe('web C366 matching', () => {
	it('C366 the group of our token wins over *, whatever the order', () => {
		const file = 'User-agent: *\nDisallow: /\n\nUser-agent: OSIONOS-Assistant\nDisallow: /private/\n';
		assert.equal(allows(file, '/public'), true);
		assert.equal(allows(file, '/private/x'), false);
		assert.equal(allows('User-agent: osionos-assistant\nDisallow: /\nUser-agent: *\nAllow: /\n', '/'), false);
	});

	it('C366 * applies when no group names us, and nothing applies when no group does', () => {
		assert.equal(allows('User-agent: googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /x\n', '/x/y'), false);
		assert.equal(allows('User-agent: googlebot\nDisallow: /\n', '/anything'), true);
	});

	it('C366 consecutive User-agent lines share one group, a rule closes it', () => {
		const file = 'User-agent: bingbot\nUser-agent: osionos-assistant\nDisallow: /a\nUser-agent: other\nDisallow: /b\n';
		assert.equal(allows(file, '/a'), false);
		assert.equal(allows(file, '/b'), true);
	});

	it('C366 two groups that both name us are merged', () => {
		const file = 'User-agent: osionos-assistant\nDisallow: /a\n\nUser-agent: osionos-assistant\nDisallow: /b\n';
		assert.deepEqual([allows(file, '/a'), allows(file, '/b'), allows(file, '/c')], [false, false, true]);
	});

	it('C366 the longest match wins and Allow wins a tie', () => {
		const file = 'User-agent: *\nDisallow: /docs/\nAllow: /docs/public/\nDisallow: /tie\nAllow: /tie\n';
		assert.equal(allows(file, '/docs/secret'), false);
		assert.equal(allows(file, '/docs/public/x'), true);
		assert.equal(allows(file, '/tie'), true);
		assert.equal(allows('User-agent: *\nAllow: /tie\nDisallow: /tie\n', '/tie'), true, 'the order of a tie does not matter');
	});

	it('C366 * matches a run, a final $ anchors the end, the rest is a prefix', () => {
		const rows: [string, string, boolean][] = [
			['/private*/x', '/private-area/x', true],
			['/private*/x', '/private/y', false],
			['/*.pdf$', '/a/b.pdf', true],
			['/*.pdf$', '/a/b.pdf?x=1', false],
			['/*.pdf', '/a/b.pdf?x=1', true],
			['/a$', '/a', true],
			['/a$', '/ab', false],
			['/a*b*c$', '/aXbYc', true],
			['/a*b*c$', '/aXbYcZ', false],
			['/*', '/anything', true],
			['/fish', '/fish.html', true],
			['/fish/', '/fish', false],
		];
		for (const [pattern, target, expected] of rows) assert.equal(patternMatches(pattern, target), expected, `${pattern} on ${target}`);
	});

	it('C366 an empty Disallow allows everything, comments and a BOM are ignored', () => {
		assert.equal(allows('\ufeffUser-agent: * # everyone\nDisallow: # nothing\n', '/x'), true);
		assert.equal(allows('User-agent: *\r\nDisallow: /x # secret\r\n', '/x/y'), false);
	});

	it('C366 a file of HTML or of no field at all is unparseable, a file of comments is an empty policy', () => {
		assert.equal(parseRobots('<!doctype html><html><body>Not found</body></html>'), null);
		assert.equal(parseRobots('this is just prose\nwith no field'), null);
		assert.equal(parseRobots('# nothing here\n\n')?.allows('/x'), true);
		assert.equal(parseRobots('')?.allows('/x'), true);
	});

	it('C366 a pathological pattern on a long path stays fast', () => {
		const started = performance.now();
		patternMatches('/*a*a*a*a*a*a*a*a*a*b$', `/${'a'.repeat(2000)}`);
		assert.ok(performance.now() - started < 500);
	});
});

function fakeWeb(t: TestContext): FakeWeb {
	const web = new FakeWeb();
	t.after(() => web.close());
	return web;
}

function context(web: FakeWeb, cache = new RobotsCache(), extra: { signal?: AbortSignal; timeoutMs?: number } = {}) {
	return { fetchImpl: web.fetchImpl, cache, signal: extra.signal ?? new AbortController().signal, timeoutMs: extra.timeoutMs };
}

async function verdict(web: FakeWeb, path = '/page', extra: { timeoutMs?: number } = {}): Promise<'allowed' | 'disallowed'> {
	try {
		await checkRobots(new URL(`https://r.test${path}`), context(web, new RobotsCache(), extra));
		return 'allowed';
	} catch (error) {
		assert.equal((await failureOf(Promise.reject(error))).code, 'web_robots_disallowed');
		return 'disallowed';
	}
}

const status = (code: number, body = ''): Handler => (_request, response) => {
	response.writeHead(code, { 'content-type': 'text/plain' });
	response.end(body);
};

describe('web C366 what the fetch of robots.txt means', () => {
	it('C366 a 200 file is applied', async (t) => {
		const web = fakeWeb(t);
		await web.host('r.test', routes({ '/robots.txt': robotsTxt('User-agent: *\nDisallow: /private') }));
		assert.equal(await verdict(web, '/private/x'), 'disallowed');
		assert.equal(await verdict(web, '/open'), 'allowed');
	});

	for (const code of [404, 410, 403, 401]) {
		it(`C366 a ${code} means no robots.txt: everything is allowed`, async (t) => {
			const web = fakeWeb(t);
			await web.host('r.test', routes({ '/robots.txt': status(code, 'User-agent: *\nDisallow: /') }));
			assert.equal(await verdict(web), 'allowed');
		});
	}

	for (const code of [500, 502, 503, 429]) {
		it(`C366 a ${code} is a refusal: the site could not be asked`, async (t) => {
			const web = fakeWeb(t);
			await web.host('r.test', routes({ '/robots.txt': status(code, 'User-agent: *\nAllow: /') }));
			assert.equal(await verdict(web), 'disallowed');
		});
	}

	it('C366 a robots.txt that never answers in time is a refusal', async (t) => {
		const web = fakeWeb(t);
		await web.host('r.test', routes({ '/robots.txt': () => undefined }));
		assert.equal(await verdict(web, '/page', { timeoutMs: 150 }), 'disallowed');
		assert.ok(await web.socketsClosed());
	});

	it('C366 a robots.txt over 64 KiB is a refusal, by content-length and by streaming', async (t) => {
		const web = fakeWeb(t);
		const big = 'User-agent: *\nAllow: /\n'.repeat(Math.ceil(ROBOTS_MAX_BYTES / 20));
		await web.host(
			'r.test',
			routes({
				'/robots.txt': (_request, response) => {
					response.writeHead(200, { 'content-type': 'text/plain' });
					response.end(big);
				},
			}),
		);
		assert.ok(big.length > ROBOTS_MAX_BYTES);
		assert.equal(await verdict(web), 'disallowed');
		const web2 = fakeWeb(t);
		await web2.host(
			'r.test',
			routes({
				'/robots.txt': (_request, response) => {
					response.writeHead(200, { 'content-type': 'text/plain', 'transfer-encoding': 'chunked' });
					response.write(big);
					response.end();
				},
			}),
		);
		assert.equal(await verdict(web2), 'disallowed');
	});

	it('C366 an HTML page served as robots.txt is unparseable: a refusal', async (t) => {
		const web = fakeWeb(t);
		await web.host('r.test', routes({ '/robots.txt': html('<html><body>Welcome</body></html>') }));
		assert.equal(await verdict(web), 'disallowed');
	});

	it('C366 a network error is a refusal', async () => {
		const web = new FakeWeb();
		assert.equal(await verdict(web), 'disallowed');
	});

	it('C366 a same-origin redirect is followed, a cross-origin one is a refusal', async (t) => {
		const web = fakeWeb(t);
		await web.host('r.test', routes({ '/robots.txt': redirect('/real-robots'), '/real-robots': robotsTxt('User-agent: *\nDisallow: /no') }));
		assert.equal(await verdict(web, '/no'), 'disallowed');
		assert.equal(await verdict(web, '/yes'), 'allowed');
		const other = fakeWeb(t);
		await other.host('r.test', routes({ '/robots.txt': redirect('https://elsewhere.test/robots.txt') }));
		await other.host('elsewhere.test', routes({ '/robots.txt': robotsTxt('User-agent: *\nAllow: /') }));
		assert.equal(await verdict(other), 'disallowed');
		assert.ok(!other.contacted.includes('elsewhere.test'), 'the other origin is never contacted');
	});

	it('C366 the deadline of the page, not a refusal, is what a robots.txt cut by it reports', async (t) => {
		const web = fakeWeb(t);
		await web.host('r.test', routes({ '/robots.txt': () => undefined, '/page': html('x') }));
		const failure = await failureOf(fetchPage(new URL('https://r.test/page'), { fetchImpl: web.fetchImpl, robots: new RobotsCache(), deadlineMs: 150 }));
		assert.equal(failure.code, 'web_timeout');
	});

	it('C366 the final URL of every hop is checked, and only when it is not cached', async (t) => {
		const web = fakeWeb(t);
		await web.host('r.test', routes({ '/robots.txt': robotsTxt('User-agent: *\nDisallow: /blocked'), '/start': redirect('/blocked'), '/ok': html('fine') }));
		const robots = new RobotsCache();
		const options = { fetchImpl: web.fetchImpl, robots };
		assert.equal((await failureOf(fetchPage(new URL('https://r.test/start'), options))).code, 'web_robots_disallowed');
		assert.equal((await fetchPage(new URL('https://r.test/ok'), options)).text, 'fine');
		assert.equal(web.seen.filter((seen) => seen.url === '/robots.txt').length, 1, 'one robots.txt for the origin');
		assert.ok(!web.seen.some((seen) => seen.url === '/blocked'));
	});
});

describe('web C366 the robots cache', () => {
	it('C366 a verdict is cached for an hour, refusals included, then asked again', async (t) => {
		const web = fakeWeb(t);
		let now = 1_000;
		const cache = new RobotsCache(() => now);
		let answer = 503;
		await web.host('r.test', routes({ '/robots.txt': (request, response) => status(answer, answer === 200 ? 'User-agent: *\nAllow: /' : '')(request, response) }));
		const check = () => checkRobots(new URL('https://r.test/x'), context(web, cache));
		await failureOf(check());
		answer = 200;
		await failureOf(check());
		assert.equal(web.seen.length, 1, 'the refusal was cached: the site is not asked again');
		now += ROBOTS_TTL_MS - 1;
		await failureOf(check());
		assert.equal(web.seen.length, 1);
		now += 2;
		await check();
		assert.equal(web.seen.length, 2, 'after the TTL the site is asked again');
	});

	it('C366 at most 1000 origins are kept, the least recently used leaves first', () => {
		const cache = new RobotsCache();
		for (let index = 0; index < ROBOTS_MAX_ORIGINS; index += 1) cache.set(`https://o${index}.test`, ROBOTS_ALLOW_ALL);
		assert.ok(cache.get('https://o0.test'), 'a read makes o0 the most recent');
		cache.set('https://new.test', ROBOTS_ALLOW_ALL);
		assert.equal(cache.size, ROBOTS_MAX_ORIGINS);
		assert.ok(cache.get('https://o0.test'));
		assert.equal(cache.get('https://o1.test'), undefined, 'o1 was the oldest');
		assert.ok(cache.get('https://new.test'));
	});
});

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import type { LookupAddress } from 'node:dns';
import { createGuardedFetch, guardedLookup } from '../src/connections/endpointGuard.ts';
import type { Resolver } from '../src/connections/endpointGuard.ts';
import { fetchPage } from '../src/web/fetcher.ts';
import { RobotsCache, ROBOTS_ALLOW_ALL } from '../src/web/robots.ts';
import { failureOf } from './webFakeHosts.ts';

/**
 * What stands between the fetcher and the inside of the network (web C343,
 * C344): the real guard against a hostile resolver, and the proof that no
 * environment proxy can reroute a request.
 *
 * What the guard guarantees, precisely: the fetcher never resolves a name
 * itself. undici asks the guarded lookup for the address of the host at each
 * connection, the lookup refuses the whole host when ANY answer is blocked,
 * and the connection goes to the address of that same answer. There is no
 * second resolution between the check and the connect, so a resolver that
 * answers differently the next time cannot change where this connection goes.
 * What it does not guarantee: that two DNS answers agree over time (a later
 * connection resolves again, and is checked again).
 */
const v4 = (address: string): LookupAddress => ({ address, family: 4 });
const v6 = (address: string): LookupAddress => ({ address, family: 6 });

const HOSTILE: Record<string, LookupAddress[]> = {
	loopback: [v4('127.0.0.1')],
	'10/8': [v4('10.1.2.3')],
	'172.16/12': [v4('172.16.0.9')],
	'192.168/16': [v4('192.168.1.1')],
	'link-local metadata': [v4('169.254.169.254')],
	'::1': [v6('::1')],
	'::ffff:7f00:1': [v6('::ffff:7f00:1')],
	'one public and one private': [v4('93.184.216.34'), v4('10.0.0.1')],
	'one public v6 and one loopback v4': [v6('2606:2800:220:1:248:1893:25c8:1946'), v4('127.0.0.1')],
};

describe('web C343 the guard resolves and refuses at connect time', () => {
	for (const [name, answers] of Object.entries(HOSTILE)) {
		it(`C343 a name that resolves to ${name} is refused, at the page and at robots.txt`, async () => {
			const asked: string[] = [];
			const resolver: Resolver = async (host) => {
				asked.push(host);
				return answers;
			};
			const fetchImpl = createGuardedFetch(resolver, { trustDevHosts: false });
			const url = new URL('https://victim.example.com/secret');
			// Nothing is known about the site: robots.txt cannot be read, so it is a refusal.
			assert.equal((await failureOf(fetchPage(url, { fetchImpl, robots: new RobotsCache() }))).code, 'web_robots_disallowed');
			// With robots.txt out of the way, the page request itself is what the guard stops.
			const robots = new RobotsCache();
			robots.set(url.origin, ROBOTS_ALLOW_ALL);
			assert.equal((await failureOf(fetchPage(url, { fetchImpl, robots }))).code, 'web_unreachable');
			assert.ok(asked.length >= 2 && asked.every((host) => host === 'victim.example.com'), 'the lookup of the guard is what resolved the name');
		});
	}

	it('C343 a resolver that turns private on the second answer cannot change where a connection goes', () => {
		let calls = 0;
		const resolver: Resolver = async () => (++calls === 1 ? [v4('93.184.216.34')] : [v4('10.0.0.1')]);
		const lookup = guardedLookup(resolver, { trustDevHosts: false });
		const first = new Promise<[string | LookupAddress[], number | undefined]>((resolve, reject) => {
			lookup('rebind.example.com', {}, (error, address, family) => (error ? reject(error) : resolve([address, family])));
		});
		return first.then(async ([address, family]) => {
			// The connect gets exactly the checked address: no name is handed on to be resolved again.
			assert.deepEqual([address, family], ['93.184.216.34', 4]);
			assert.equal(calls, 1, 'one resolution for one connection');
			await assert.rejects(
				new Promise((resolve, reject) => {
					lookup('rebind.example.com', { all: true }, (error, found) => (error ? reject(error) : resolve(found)));
				}),
				/not allowed/,
			);
			assert.equal(calls, 2, 'the next connection resolves, and is checked, again');
		});
	});
});

describe('web C344 no proxy from the environment', () => {
	it('C344 with HTTP_PROXY and HTTPS_PROXY set, the request goes direct and the proxy counts zero', async () => {
		let proxied = 0;
		const proxy = createServer(() => {
			proxied += 1;
		});
		proxy.on('connect', () => {
			proxied += 1;
		});
		await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
		const proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
		const names = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy'];
		const saved = names.map((name) => process.env[name]);
		for (const name of names) process.env[name] = proxyUrl;
		try {
			const asked: string[] = [];
			const resolver: Resolver = async (host) => {
				asked.push(host);
				return [v4('127.0.0.1')];
			};
			const url = new URL('https://direct.example.com/');
			const robots = new RobotsCache();
			robots.set(url.origin, ROBOTS_ALLOW_ALL);
			await failureOf(fetchPage(url, { fetchImpl: createGuardedFetch(resolver, { trustDevHosts: false }), robots }));
			// The guard's own lookup was asked for the target: the connection was made by us, not by a proxy.
			assert.deepEqual([...new Set(asked)], ['direct.example.com']);
			assert.equal(proxied, 0);
		} finally {
			names.forEach((name, index) => {
				if (saved[index] === undefined) delete process.env[name];
				else process.env[name] = saved[index];
			});
			await new Promise((resolve) => proxy.close(resolve));
		}
	});
});

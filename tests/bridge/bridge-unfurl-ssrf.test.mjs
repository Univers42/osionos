/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-unfurl-ssrf.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// SSRF guard: every negative test asserts the absence of a connection (a real
// listener or a request spy), not only that an error was thrown.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';

import {
	createDnsResolver,
	createFetchContext,
	createPinnedLookup,
	isBlockedAddress,
	parseTargetUrl,
	safeFetch,
} from '../../scripts/bridge-unfurl-net.mjs';
import { isBlockedAddress as isBlockedByUrlGuard } from '../../scripts/bridge-url-guard.mjs';
import { html, loopbackNet, sendHtml, startServer } from './bridge-unfurl-helpers.mjs';

const status = (code) => (error) => error.status === code;
const nextTick = () => new Promise((resolve) => setImmediate(resolve));

describe('address classification', () => {
	const blocked = [
		'127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0',
		'100.64.0.1', '100.100.100.100', '198.18.0.1', '192.0.0.8', '192.0.2.1', '198.51.100.1', '203.0.113.1',
		'224.0.0.1', '240.0.0.1', '255.255.255.255',
		'::', '::1', 'fe80::1', 'fc00::1', 'fdaa::3', 'fd7a:115c:a1e0::1', 'ff02::1', '::7f00:1',
		'::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a00:1', '64:ff9b::7f00:1', '64:ff9b:1::a00:1', '64:ff9b:1:ab0a::1:0', '64:ff9b:1:ffff:ffff:ffff:ffff:ffff',
		'2001:db8::1', '2001::1', '2002:7f00:1::', '3fff::1',
		'127.1', 'not-an-ip',
	];
	const allowed = ['8.8.8.8', '93.184.216.34', '172.15.255.255', '172.32.0.1', '100.63.255.255', '100.128.0.1', '2606:4700::1111', '2a00:1450:4001::1', '::ffff:8.8.8.8'];

	for (const address of blocked) it(`blocks ${address}`, () => assert.equal(isBlockedAddress(address), true));
	for (const address of allowed) it(`allows ${address}`, () => assert.equal(isBlockedAddress(address), false));

	// The link preview's guard decides too: NAT64 is refused there even with a public
	// IPv4 inside, so it is refused here, and nothing that guard refuses gets through.
	it('refuses everything bridge-url-guard refuses', () => {
		assert.equal(isBlockedAddress('64:ff9b::808:808'), true);
		for (const address of [...blocked, ...allowed, '64:ff9b::808:808', '100::1', 'fec0::1', '192.88.99.1']) {
			if (isBlockedByUrlGuard(address)) assert.equal(isBlockedAddress(address), true, address);
		}
	});
});

describe('URL acceptance', () => {
	it('refuses userinfo with 422, other ports, other schemes and long URLs', () => {
		assert.throws(() => parseTargetUrl('http://user:pw@example.com/'), status(422));
		assert.throws(() => parseTargetUrl('https://user@example.com/'), status(422));
		assert.throws(() => parseTargetUrl('http://example.com:22/'), status(422));
		assert.throws(() => parseTargetUrl('https://example.com:8443/'), status(422));
		assert.throws(() => parseTargetUrl('ftp://example.com/'), status(422));
		assert.throws(() => parseTargetUrl('file:///etc/passwd'), status(422));
		assert.throws(() => parseTargetUrl(`http://example.com/${'a'.repeat(2048)}`), status(422));
		assert.throws(() => parseTargetUrl('http://localhost/'), status(422));
		assert.throws(() => parseTargetUrl('http://metadata.internal/'), status(422));
		assert.throws(() => parseTargetUrl('http://app.flycast/'), status(422));
		assert.throws(() => parseTargetUrl('http://app.vm.flycast./'), status(422));
		assert.throws(() => parseTargetUrl(42), status(422));
		assert.throws(() => parseTargetUrl(`${' '.repeat(3000)}http://example.com/`), status(422));
	});

	it('accepts implied and explicit 80/443', () => {
		assert.equal(parseTargetUrl('http://example.com/a').href, 'http://example.com/a');
		assert.equal(parseTargetUrl('https://example.com:443/a').href, 'https://example.com/a');
		assert.equal(parseTargetUrl('http://example.com:443/a').port, '443');
	});

	it('never connects for a refused port', async () => {
		const target = await startServer((_request, response) => sendHtml(response, html('x')));
		after(target.close);
		await assert.rejects(safeFetch(`http://127.0.0.1:${target.port}/`, {}, createFetchContext()), status(422));
		assert.equal(target.seen.connections, 0);
	});
});

describe('literal private hosts never connect', () => {
	const literals = [
		'127.0.0.1', '2130706433', '0x7f.1', '0177.0.0.1', '127.1', '0.0.0.0', '[::1]', '[::]',
		'[::ffff:127.0.0.1]', '[::ffff:7f00:1]', '[64:ff9b::7f00:1]', '[::7f00:1]',
		'100.100.100.100', '169.254.169.254', '[fdaa::3]', '[fd7a:115c:a1e0::1]', '10.0.0.1',
	];

	it('records 0 connections and 0 request attempts for every literal form', async () => {
		const target = await startServer((_request, response) => sendHtml(response, html('secret')));
		after(target.close);
		const net = loopbackNet({ ports: [target.port, 80] });
		// The real default isBlocked (not the loopback override): this is the guard under test.
		const options = { ...net.options, isBlocked: undefined };
		for (const literal of literals) {
			await assert.rejects(
				safeFetch(`http://${literal}:${target.port}/`, {}, createFetchContext(options)),
				status(422),
				`${literal} must be refused`,
			);
			await assert.rejects(safeFetch(`http://${literal}/`, {}, createFetchContext(options)), status(422), `${literal}:80 must be refused`);
		}
		await nextTick();
		assert.equal(target.seen.connections, 0, 'the 127.0.0.1 listener saw a connection');
		assert.deepEqual(net.attempts, [], 'no outbound request may be attempted');
	});
});

describe('DNS answers', () => {
	it('refuses a host when ANY answer is blocked (mixed public + 10.0.0.1)', async () => {
		const target = await startServer((_request, response) => sendHtml(response, html('x')));
		after(target.close);
		const net = loopbackNet({ ports: [target.port], names: { 'mixed.test': ['93.184.216.34', '10.0.0.1'], 'v6.test': ['2606:4700::1111', 'fdaa::3'] } });
		for (const host of ['mixed.test', 'v6.test']) {
			await assert.rejects(safeFetch(`http://${host}:${target.port}/`, {}, createFetchContext(net.options)), status(502));
		}
		assert.deepEqual(net.attempts, []);
		assert.equal(target.seen.connections, 0);
	});

	it('answers a blocked DNS answer exactly like a missing name (no internal-name oracle)', async () => {
		const net = loopbackNet({ ports: [80], names: { 'db.internal-docker.test': ['10.0.0.5'] } });
		const reply = async (host) => safeFetch(`http://${host}/`, {}, createFetchContext(net.options)).catch((error) => ({ status: error.status, message: error.message }));
		const blocked = await reply('db.internal-docker.test');
		const missing = await reply('no-such-name.test');
		assert.deepEqual(blocked, missing);
		assert.equal(blocked.status, 502);
	});

	it('refuses a host that resolves to nothing', async () => {
		const net = loopbackNet({ ports: [80] });
		await assert.rejects(safeFetch('http://nothing.test/', {}, createFetchContext(net.options)), status(502));
		assert.deepEqual(net.attempts, []);
	});

	it('pinned lookup handles all:true and refuses when any address is blocked', async () => {
		const call = (addresses, options) => new Promise((resolve) => createPinnedLookup(addresses)('h.test', options, (...args) => resolve(args)));
		const [error] = await call(['93.184.216.34', '10.0.0.1'], { all: true });
		assert.equal(error.status, 422);
		const [singleError] = await call(['93.184.216.34', '10.0.0.1'], {});
		assert.equal(singleError.status, 422);
		const [noError, list] = await call(['93.184.216.34', '2606:4700::1111'], { all: true });
		assert.equal(noError, null);
		assert.deepEqual(list, [{ address: '93.184.216.34', family: 4 }, { address: '2606:4700::1111', family: 6 }]);
		const [, address, family] = await call(['93.184.216.34'], {});
		assert.deepEqual([address, family], ['93.184.216.34', 4]);
	});

	it('connects to the validated address while Host stays the hostname', async () => {
		const target = await startServer((_request, response) => sendHtml(response, html('ok')));
		after(target.close);
		const net = loopbackNet({ ports: [target.port], names: { 'public.test': ['127.0.0.1'] } });
		const reply = await safeFetch(`http://public.test:${target.port}/p`, { wantBody: () => true }, createFetchContext(net.options));
		assert.equal(reply.status, 200);
		assert.equal(target.seen.requests[0].headers.host, `public.test:${target.port}`);
		assert.equal(target.seen.requests[0].headers['accept-encoding'], 'identity');
		assert.equal(target.seen.requests[0].headers.cookie, undefined);
		assert.equal(target.seen.requests[0].headers.authorization, undefined);
	});

	it('a never-answering resolver fails within 2.5 s', async () => {
		const silent = dgram.createSocket('udp4');
		await new Promise((resolve) => silent.bind(0, '127.0.0.1', resolve));
		after(() => silent.close());
		const resolveHost = createDnsResolver({ servers: [`127.0.0.1:${silent.address().port}`] });
		const started = performance.now();
		await assert.rejects(safeFetch('http://slow-dns.example/', {}, createFetchContext({ resolveHost })), status(502));
		assert.ok(performance.now() - started < 2500, `took ${Math.round(performance.now() - started)} ms`);
	});
});

describe('redirects', () => {
	async function redirectingServer() {
		const target = await startServer((request, response) => {
			const routes = {
				'/to-metadata': 'http://169.254.169.254/latest/meta-data/',
				'/to-internal': `http://internal.test:${target.port}/`,
				'/to-ssh-port': 'http://public.test:22/',
				'/to-userinfo': 'http://u:p@public.test/',
				'/h1': '/h2', '/h2': '/h3', '/h3': '/h4', '/h4': '/end', '/g1': '/g2', '/g2': '/g3', '/g3': '/end',
			};
			if (routes[request.url]) {
				response.writeHead(302, { location: routes[request.url] });
				return response.end();
			}
			return sendHtml(response, html('end'));
		});
		after(target.close);
		return target;
	}

	it('refuses a 302 to a literal metadata address without connecting', async () => {
		const target = await redirectingServer();
		const net = loopbackNet({ ports: [target.port], names: { 'public.test': ['127.0.0.1'] } });
		await assert.rejects(safeFetch(`http://public.test:${target.port}/to-metadata`, {}, createFetchContext(net.options)), status(422));
		assert.deepEqual(net.attempts, ['public.test']);
	});

	it('refuses a 302 to a host resolving to 10.x', async () => {
		const target = await redirectingServer();
		const net = loopbackNet({ ports: [target.port], names: { 'public.test': ['127.0.0.1'], 'internal.test': ['10.0.0.1'] } });
		await assert.rejects(safeFetch(`http://public.test:${target.port}/to-internal`, {}, createFetchContext(net.options)), status(502));
		assert.deepEqual(net.attempts, ['public.test']);
	});

	it('re-checks port and userinfo on every hop', async () => {
		const target = await redirectingServer();
		const net = loopbackNet({ ports: [target.port], names: { 'public.test': ['127.0.0.1'] } });
		await assert.rejects(safeFetch(`http://public.test:${target.port}/to-ssh-port`, {}, createFetchContext(net.options)), status(422));
		await assert.rejects(safeFetch(`http://public.test:${target.port}/to-userinfo`, {}, createFetchContext(net.options)), status(422));
		assert.deepEqual(net.attempts, ['public.test', 'public.test']);
	});

	it('follows 3 hops and errors on the 4th', async () => {
		const target = await redirectingServer();
		const net = loopbackNet({ ports: [target.port], names: { 'public.test': ['127.0.0.1'] } });
		const ok = await safeFetch(`http://public.test:${target.port}/g1`, {}, createFetchContext(net.options));
		assert.equal(ok.status, 200);
		assert.equal(ok.url.pathname, '/end');
		await assert.rejects(safeFetch(`http://public.test:${target.port}/h1`, {}, createFetchContext(net.options)), (error) => error.status === 502 && /redirects/.test(error.message));
	});

	it('does not follow when redirects is 0', async () => {
		const target = await redirectingServer();
		const net = loopbackNet({ ports: [target.port], names: { 'public.test': ['127.0.0.1'] } });
		const reply = await safeFetch(`http://public.test:${target.port}/to-metadata`, { redirects: 0 }, createFetchContext(net.options));
		assert.equal(reply.status, 302);
		assert.deepEqual(net.attempts, ['public.test']);
	});
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-link-preview-ssrf.test.mjs                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The chat link preview fetches a user-supplied URL server-side: it must only
// ever connect to a PUBLIC address, and it must keep doing so after a redirect
// and after a DNS answer that changes between the check and the connect.
//
// Table-driven: one address per blocked range (v4 and the IPv6 spellings) is
// refused with 422, a public address goes through, a redirect into the private
// network is refused, a fourth hop is a 502 and a rebinding resolver is refused
// at connect time.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { handleLinkPreview } from '../../scripts/bridge-chat-media.mjs';

const CONFIG = { allowedOrigin: 'https://localhost:3001' };

/** One address per blocked range, in both the v4 and the v6 spelling. */
const BLOCKED_URLS = [
	['0.0.0.0/8', 'http://0.1.2.3/', 'http://[::ffff:0.1.2.3]/'],
	['10.0.0.0/8', 'http://10.0.0.5/', 'http://[::ffff:a00:5]/'],
	['100.64.0.0/10 (CGNAT)', 'http://100.97.49.118/', 'http://[::ffff:6461:3176]/'],
	['127.0.0.0/8', 'http://127.0.0.1/', 'http://[::ffff:7f00:1]/'],
	['169.254.0.0/16', 'http://169.254.169.254/', 'http://[::ffff:a9fe:a9fe]/'],
	['172.16.0.0/12', 'http://172.16.0.1/', 'http://[::ffff:ac10:1]/'],
	['192.0.0.0/24', 'http://192.0.0.1/', 'http://[::ffff:c000:1]/'],
	['192.0.2.0/24', 'http://192.0.2.1/', 'http://[::ffff:c000:201]/'],
	['192.168.0.0/16', 'http://192.168.1.1/', 'http://[::ffff:c0a8:101]/'],
	['198.18.0.0/15', 'http://198.18.0.1/', 'http://[::ffff:c612:1]/'],
	['198.51.100.0/24', 'http://198.51.100.1/', 'http://[::ffff:c633:6401]/'],
	['203.0.113.0/24', 'http://203.0.113.1/', 'http://[::ffff:cb00:7101]/'],
	['224.0.0.0/4', 'http://224.0.0.1/', 'http://[::ffff:e000:1]/'],
	['240.0.0.0/4', 'http://240.0.0.1/', 'http://[::ffff:f000:1]/'],
	['255.255.255.255', 'http://255.255.255.255/', 'http://[::ffff:ffff:ffff]/'],
	['::1 (loopback)', 'http://[::1]/', null],
	[':: (unspecified)', 'http://[::]/', null],
	['::ffff:0:0/96 (mapped)', 'http://[::ffff:0:0]/', null],
	['64:ff9b::/96 (NAT64)', 'http://[64:ff9b::a00:5]/', null],
	['fec0::/10 (site-local)', 'http://[fec0::1]/', null],
	['ff00::/8 (multicast)', 'http://[ff02::1]/', null],
	['2001:db8::/32 (doc)', 'http://[2001:db8::1]/', null],
	['fc00::/7 (unique local)', 'http://[fc00::1]/', null],
	['fe80::/10 (link-local)', 'http://[fe80::1]/', null],
];

/** A response double that records what the handler answered. */
function fakeResponse() {
	const state = { status: 0, headers: {}, body: null };
	return {
		state,
		writeHead(status, headers) {
			state.status = status;
			state.headers = headers;
		},
		end(payload) {
			state.body = payload ? JSON.parse(payload) : null;
		},
	};
}

/** A canned upstream response. */
function upstreamResponse(route) {
	const status = route.status ?? 200;
	const body = Buffer.from(route.body ?? '');
	return {
		status,
		ok: status >= 200 && status < 300,
		headers: route.headers ?? {},
		body,
		text: () => body.toString('utf8'),
	};
}

/** Resolve a host the way a socket does — through the guarded lookup. */
function connectTo(hostname, lookup) {
	return new Promise((resolve, reject) => {
		lookup(hostname, { family: 0, hints: 0 }, (error, address, family) => {
			if (error) reject(error);
			else resolve({ address, family });
		});
	});
}

/**
 * A transport double: it connects first (so the guarded lookup runs exactly
 * like it would on a real socket) and only then serves the canned page.
 * `followRedirects` models fetch's unchecked `redirect: 'follow'` — the mode
 * the revert proof uses.
 */
function fakeTransport(routes, seen = []) {
	return async (url, options = {}) => {
		seen.push(url.toString());
		if (options.followRedirects) return followRedirects(url.toString(), routes);
		if (options.lookup) await connectTo(url.hostname, options.lookup);
		const route = routes[url.toString()];
		if (!route) throw new Error(`no canned route for ${url}`);
		return upstreamResponse(route);
	};
}

/** fetch's `redirect: 'follow'`: hop after hop, no validation in between. */
async function followRedirects(target, routes) {
	let current = target;
	for (let hop = 0; hop < 10; hop += 1) {
		const route = routes[current];
		if (!route) throw new Error(`no canned route for ${current}`);
		const location = route.headers?.location;
		if (route.status >= 300 && route.status < 400 && location) {
			current = new URL(location, current).toString();
			continue;
		}
		return upstreamResponse(route);
	}
	throw new Error('too many redirects');
}

/** A resolver that answers with the scripted addresses, one call at a time. */
function scriptedResolver(answers) {
	let call = 0;
	return async () => {
		const answer = answers[Math.min(call, answers.length - 1)];
		call += 1;
		return answer.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
	};
}

/** Call the handler and return the error it threw (null when it answered). */
async function previewError(payload, deps = {}) {
	try {
		await handleLinkPreview({ fetchImpl: async () => { throw new Error('the BaaS fetch must not be used'); }, ...deps }, null, payload, fakeResponse(), CONFIG);
		return null;
	} catch (error) {
		return error;
	}
}

/** Call the handler and return what it answered. */
async function preview(payload, deps = {}) {
	const response = fakeResponse();
	await handleLinkPreview({ fetchImpl: async () => { throw new Error('the BaaS fetch must not be used'); }, ...deps }, null, payload, response, CONFIG);
	return response.state;
}

describe('link preview — SSRF guard', () => {
	for (const [range, url, mappedUrl] of BLOCKED_URLS) {
		for (const blocked of [url, mappedUrl].filter(Boolean)) {
			it(`refuses ${range} — ${blocked}`, async () => {
				const error = await previewError({ url: blocked }, {
					linkPreviewTransport: async () => { throw new Error('the transport must not be reached'); },
				});
				assert.equal(error?.status, 422, `expected 422 for ${blocked}, got ${error?.status}`);
				assert.match(error.message, /private address/);
			});
		}
	}

	it('fetches a public address and answers the preview', async () => {
		const seen = [];
		const transport = fakeTransport({
			'http://93.184.216.34/': { body: '<html><head><meta property="og:title" content="Public page"></head></html>' },
		}, seen);
		const answer = await preview({ url: 'http://93.184.216.34/' }, { linkPreviewTransport: transport });
		assert.equal(answer.status, 200);
		assert.equal(answer.body.preview.title, 'Public page');
		assert.deepEqual(seen, ['http://93.184.216.34/']);
	});

	it('fetches a public IPv6 address', async () => {
		const transport = fakeTransport({ 'http://[2606:4700:4700::1111]/': { body: '<html><title>Public v6</title></html>' } });
		const answer = await preview({ url: 'http://[2606:4700:4700::1111]/' }, { linkPreviewTransport: transport });
		assert.equal(answer.status, 200);
		assert.equal(answer.body.preview.title, 'Public v6');
	});

	it('refuses a redirect into the private network', async () => {
		const seen = [];
		const transport = fakeTransport({
			'http://93.184.216.34/start': { status: 302, headers: { location: 'http://100.97.49.118/' } },
			'http://100.97.49.118/': { body: '<html><title>the BaaS VM</title></html>' },
		}, seen);
		const error = await previewError({ url: 'http://93.184.216.34/start' }, { linkPreviewTransport: transport });
		assert.equal(error?.status, 422, `expected 422, got ${error?.status}: ${error?.message}`);
		assert.match(error.message, /private address/);
		assert.deepEqual(seen, ['http://93.184.216.34/start'], 'the private target must never be fetched');
	});

	it('refuses a redirect to a private host name', async () => {
		const seen = [];
		const transport = fakeTransport({
			'http://93.184.216.34/start': { status: 302, headers: { location: 'http://tailnet.internal/' } },
		}, seen);
		const error = await previewError({ url: 'http://93.184.216.34/start' }, { linkPreviewTransport: transport });
		assert.equal(error?.status, 422);
		assert.deepEqual(seen, ['http://93.184.216.34/start']);
	});

	it('follows up to three public redirects', async () => {
		const seen = [];
		const transport = fakeTransport({
			'http://93.184.216.34/1': { status: 302, headers: { location: '/2' } },
			'http://93.184.216.34/2': { status: 302, headers: { location: '/3' } },
			'http://93.184.216.34/3': { status: 302, headers: { location: '/4' } },
			'http://93.184.216.34/4': { body: '<html><title>Landed</title></html>' },
		}, seen);
		const answer = await preview({ url: 'http://93.184.216.34/1' }, { linkPreviewTransport: transport });
		assert.equal(answer.status, 200);
		assert.equal(answer.body.preview.title, 'Landed');
		assert.deepEqual(seen, ['http://93.184.216.34/1', 'http://93.184.216.34/2', 'http://93.184.216.34/3', 'http://93.184.216.34/4']);
	});

	it('answers 502 on a fourth redirect', async () => {
		const transport = fakeTransport({
			'http://93.184.216.34/1': { status: 302, headers: { location: '/2' } },
			'http://93.184.216.34/2': { status: 302, headers: { location: '/3' } },
			'http://93.184.216.34/3': { status: 302, headers: { location: '/4' } },
			'http://93.184.216.34/4': { status: 302, headers: { location: '/5' } },
			'http://93.184.216.34/5': { body: '<html><title>Too far</title></html>' },
		});
		const error = await previewError({ url: 'http://93.184.216.34/1' }, { linkPreviewTransport: transport });
		assert.equal(error?.status, 502, `expected 502, got ${error?.status}: ${error?.message}`);
	});

	it('refuses a host that rebinds to a private address between check and connect', async () => {
		let calls = 0;
		const resolveHost = async () => {
			calls += 1;
			return calls === 1
				? [{ address: '93.184.216.34', family: 4 }]
				: [{ address: '10.0.0.5', family: 4 }];
		};
		const seen = [];
		const transport = fakeTransport({ 'http://rebind.test/': { body: '<html><title>Rebound</title></html>' } }, seen);
		const error = await previewError({ url: 'http://rebind.test/' }, { resolveHost, linkPreviewTransport: transport });
		assert.equal(error?.status, 422, `expected 422, got ${error?.status}: ${error?.message}`);
		assert.match(error.message, /private address/);
		assert.equal(calls, 2, 'the check resolves once, the connect resolves again');
		assert.deepEqual(seen, ['http://rebind.test/']);
	});

	it('refuses a host that resolves to a private address at all', async () => {
		const resolveHost = scriptedResolver([['100.97.49.118']]);
		const error = await previewError({ url: 'http://tailnet.test/' }, {
			resolveHost,
			linkPreviewTransport: async () => { throw new Error('the transport must not be reached'); },
		});
		assert.equal(error?.status, 422);
		assert.match(error.message, /private address/);
	});

	it('never connects to the private address with the real transport either', async () => {
		// The production transport (node:http + the guarded lookup) against a
		// server that listens on loopback: the name answers public for the
		// check and loopback for the connect, so only the connect-time lookup
		// can stop the socket — and it must.
		let hits = 0;
		const server = http.createServer((request, response) => {
			hits += 1;
			response.writeHead(200, { 'content-type': 'text/html' });
			response.end('<html><title>the private service</title></html>');
		});
		await new Promise((listening) => server.listen(0, '127.0.0.1', listening));
		let calls = 0;
		const resolveHost = async () => {
			calls += 1;
			return calls === 1 ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '127.0.0.1', family: 4 }];
		};
		try {
			const error = await previewError({ url: 'http://rebind.test/' }, { resolveHost });
			assert.equal(error?.status, 422, `expected 422, got ${error?.status}: ${error?.message}`);
			assert.match(error.message, /private address/);
			assert.equal(hits, 0, 'the private service must never be reached');
			assert.equal(calls, 2, 'the check resolves once, the connect resolves again');
		} finally {
			server.close();
		}
	});

	it('refuses a non-http scheme and an unresolvable host', async () => {
		const scheme = await previewError({ url: 'file:///etc/passwd' }, {});
		assert.equal(scheme?.status, 422);
		const unresolvable = await previewError({ url: 'http://nowhere.invalid/' }, {
			resolveHost: async () => [],
			linkPreviewTransport: async () => { throw new Error('the transport must not be reached'); },
		});
		assert.equal(unresolvable?.status, 422);
	});
});

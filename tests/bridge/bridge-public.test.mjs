/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-public.test.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createPublicHandler } from '../../scripts/bridge-public.mjs';

const config = { baasUrl: 'http://baas', serviceKey: 'k', allowedOrigin: 'http://app' };
const PAGE_ID = '99999999-2222-4333-8444-555555555555';
const TOKEN = 'abcdef0123456789abcdef0123456789';
const ON = { OSIONOS_PUBLISH_ENABLED: '1' };

function mockResponse() {
	return {
		statusCode: 0,
		headers: {},
		body: null,
		writeHead(status, headers) { this.statusCode = status; this.headers = headers ?? {}; return this; },
		end(payload) { this.body = payload ? JSON.parse(payload) : null; },
	};
}
const request = (method) => ({ method, headers: { authorization: 'Bearer t' }, socket: { remoteAddress: '1.2.3.4' } });
const getFrom = (remoteAddress, headers = {}) => ({ method: 'GET', headers, socket: { remoteAddress } });
const verifySession = () => ({ userId: 'user-1' });
const grantPage = (ownerId) => async () => ({ row: { owner_id: ownerId } });
const emptyRows = async () => ({ ok: true, status: 200, text: async () => '[]' });
const handlerWith = (fetchImpl, env = ON, handlerConfig = config) => createPublicHandler({
	config: handlerConfig,
	verifySession,
	verifyPageAccess: grantPage('user-1'),
	fetchImpl,
	env,
});

describe('publish/public ACL + flag gate', () => {
	it('404s the publish path when the feature flag is off', async () => {
		const handler = createPublicHandler({ config, verifySession, verifyPageAccess: grantPage('user-1'), fetchImpl: async () => ({ ok: true, status: 200, text: async () => '[]' }), env: {} });
		const res = mockResponse();
		await handler(new URL(`http://app/api/pages/${PAGE_ID}/publish`), request('POST'), res, config);
		assert.equal(res.statusCode, 404);
	});

	it('403s a publish by someone who is not the page owner', async () => {
		const handler = createPublicHandler({ config, verifySession, verifyPageAccess: grantPage('someone-else'), fetchImpl: async () => ({ ok: true, status: 200, text: async () => '[]' }), env: ON });
		const res = mockResponse();
		await handler(new URL(`http://app/api/pages/${PAGE_ID}/publish`), request('POST'), res, config);
		assert.equal(res.statusCode, 403);
	});

	it('public GET reads ONLY the snapshot table and 404s an unknown token', async () => {
		const seen = [];
		const fetchImpl = async (url) => { seen.push(String(url)); return { ok: true, status: 200, text: async () => '[]' }; };
		const handler = createPublicHandler({ config, verifySession, verifyPageAccess: grantPage('user-1'), fetchImpl, env: ON });
		const res = mockResponse();
		await handler(new URL(`http://app/api/public/pages/${TOKEN}`), request('GET'), res, config);
		assert.equal(res.statusCode, 404);
		assert.ok(seen.some((u) => u.includes('osionos_published_pages')), 'queried the snapshot table');
		assert.ok(!seen.some((u) => /osionos_pages\?/.test(u)), 'never queried live pages');
	});

	it('ignores unrelated paths', async () => {
		const handler = createPublicHandler({ config, verifySession, verifyPageAccess: grantPage('user-1'), fetchImpl: async () => ({ ok: true, status: 200, text: async () => '[]' }), env: ON });
		const handled = await handler(new URL('http://app/api/pages'), request('GET'), mockResponse(), config);
		assert.equal(handled, false);
	});
});

describe('public read throttle uses the proxy-derived address', () => {
	it('429s the 31st request even when X-Forwarded-For rotates on one socket', async () => {
		const handler = handlerWith(emptyRows);
		// Start all 31 in one tick so the bucket sees them before the slow refill
		// (0.5 token/s) can hand a throttled caller a fresh token.
		const runs = Array.from({ length: 31 }, (_, index) => {
			const response = mockResponse();
			const done = handler(
				new URL(`http://app/api/public/pages/${TOKEN}`),
				getFrom('203.0.113.77', { 'x-forwarded-for': `198.51.100.${index + 1}` }),
				response,
				config,
			);
			return { response, done };
		});
		await Promise.all(runs.map((run) => run.done));
		const statuses = runs.map((run) => run.response.statusCode);
		assert.ok(statuses.slice(0, 30).every((status) => status === 404), 'the first 30 pass the bucket');
		assert.equal(statuses[30], 429);
	});

	it('buckets by the configured header instead of the socket', async () => {
		const handler = handlerWith(emptyRows, ON, { ...config, clientIpHeader: 'x-real-ip' });
		const start = (ip, xff) => {
			const response = mockResponse();
			const done = handler(
				new URL(`http://app/api/public/pages/${TOKEN}`),
				getFrom('192.0.2.9', { 'x-real-ip': ip, 'x-forwarded-for': xff }),
				response,
				config,
			);
			return { response, done };
		};
		const first = Array.from({ length: 30 }, (_, index) => start('198.51.100.200', `198.51.100.${index + 1}`));
		await Promise.all(first.map((run) => run.done));
		assert.ok(first.every((run) => run.response.statusCode === 404));
		const exhausted = start('198.51.100.200', '198.51.100.99');
		await exhausted.done;
		assert.equal(exhausted.response.statusCode, 429, 'the same header bucket is exhausted');
		const other = start('198.51.100.201', '198.51.100.99');
		await other.done;
		assert.equal(other.response.statusCode, 404, 'another header value gets its own bucket');
	});
});

describe('public read cache headers', () => {
	it('lets a published 200 be cached for at most 60 seconds', async () => {
		const page = [{ title: 'Snapshot', icon: null, content: [{ id: 'p', type: 'paragraph', content: 'hi' }], published_at: '2026-10-01T10:00:00.000Z' }];
		const handler = handlerWith(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(page) }));
		const response = mockResponse();
		await handler(new URL(`http://app/api/public/pages/${TOKEN}`), getFrom('198.51.100.10'), response, config);
		assert.equal(response.statusCode, 200);
		assert.equal(response.headers['cache-control'], 'public, max-age=60');
	});

	it('never caches a 404', async () => {
		const handler = handlerWith(emptyRows);
		const response = mockResponse();
		await handler(new URL(`http://app/api/public/pages/${TOKEN}`), getFrom('198.51.100.11'), response, config);
		assert.equal(response.statusCode, 404);
		assert.equal(response.headers['cache-control'], 'no-store');
	});
});

describe('publish writes a sanitised snapshot', () => {
	const PRIVATE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
	const privateMention = (id) => ({ id, type: 'paragraph', content: `see [[page:${PRIVATE_ID}]]` });
	const publishRow = (content) => async () => ({
		row: { owner_id: 'user-1', title: 'Public', icon: null, content },
	});

	it('stores content without the mentioned page uuid', async () => {
		const calls = [];
		const fetchImpl = async (url, options) => {
			calls.push({ url: String(url), options });
			return { ok: true, status: 200, text: async () => JSON.stringify([{ token: TOKEN }]) };
		};
		const handler = createPublicHandler({
			config,
			verifySession,
			verifyPageAccess: publishRow([privateMention('p1'), { id: 'd', type: 'database_inline', databaseId: PRIVATE_ID }]),
			fetchImpl,
			env: ON,
		});
		const response = mockResponse();
		await handler(new URL(`http://app/api/pages/${PAGE_ID}/publish`), request('POST'), response, config);
		assert.equal(response.statusCode, 200);
		const written = JSON.parse(calls[0].options.body);
		assert.equal(JSON.stringify(written.content).includes(PRIVATE_ID), false);
		assert.deepEqual(written.content.map((block) => block.type), ['paragraph']);
	});

	it('passes the access gate refusal through and writes nothing', async () => {
		const refusal = Object.assign(new Error('You do not have access to this page.'), { status: 403 });
		let writes = 0;
		const handler = createPublicHandler({
			config,
			verifySession,
			verifyPageAccess: async () => { throw refusal; },
			fetchImpl: async () => { writes += 1; return { ok: true, status: 200, text: async () => '[]' }; },
			env: ON,
		});
		const response = mockResponse();
		await handler(new URL(`http://app/api/pages/${PAGE_ID}/publish`), request('POST'), response, config);
		assert.equal(response.statusCode, 403);
		assert.equal(response.body.message, refusal.message);
		assert.equal(writes, 0);
	});
});

// #61: the owner's client sends which gated cells and blocks its view showed; the
// stored copy follows it, and anything the publish did not name stays private.
describe('publish carries the owner\'s view of gated content', () => {
	const content = [
		{ id: 'b1', type: 'paragraph', content: 'shown block', visibleWhen: 'prop("Public")' },
		{ id: 'L', type: 'layout', content: '', layoutCells: [
			{ id: 'c1', colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 1, blocks: [], content: 'shown cell', visibilityFormula: 'prop("Done")' },
			{ id: 'c2', colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 1, blocks: [], content: 'hidden cell', visibilityFormula: 'prop("Draft")' },
		] },
	];
	const postWith = (body) => Object.assign(Readable.from([JSON.stringify(body)]), {
		method: 'POST', headers: { authorization: 'Bearer t' }, socket: { remoteAddress: '1.2.3.4' },
	});
	async function publishWith(body) {
		const stored = [];
		const fetchImpl = async (url, init) => {
			if (init?.method === 'POST') stored.push(JSON.parse(init.body));
			return { ok: true, status: 200, text: async () => JSON.stringify([{ token: TOKEN }]) };
		};
		const handler = createPublicHandler({
			config, verifySession, fetchImpl, env: ON,
			verifyPageAccess: async () => ({ row: { owner_id: 'user-1', title: 'T', content } }),
		});
		const res = mockResponse();
		await handler(new URL(`http://app/api/pages/${PAGE_ID}/publish`), postWith(body), res, config);
		return { status: res.statusCode, stored: stored[0]?.content };
	}

	it('stores the gated cells and blocks the owner\'s view showed, and only those', async () => {
		const { status, stored } = await publishWith({ shown: ['b1', 'c1'] });
		assert.equal(status, 200);
		assert.deepEqual(stored.map((block) => block.id), ['b1', 'L']);
		assert.deepEqual(stored[1].layoutCells.map((cell) => cell.id), ['c1']);
	});

	it('treats a malformed decision as no decision: nothing gated goes public', async () => {
		for (const shown of ['b1', [42, { id: 'c1' }], null]) {
			const { status, stored } = await publishWith({ shown });
			assert.equal(status, 200);
			assert.deepEqual(stored.map((block) => block.id), ['L']);
			assert.deepEqual(stored[0].layoutCells, []);
		}
	});
});

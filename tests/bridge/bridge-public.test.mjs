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
import { createPublicHandler } from '../../scripts/bridge-public.mjs';

const config = { baasUrl: 'http://baas', serviceKey: 'k', allowedOrigin: 'http://app' };
const PAGE_ID = '99999999-2222-4333-8444-555555555555';
const TOKEN = 'abcdef0123456789abcdef0123456789';
const ON = { OSIONOS_PUBLISH_ENABLED: '1' };

function mockResponse() {
	return { statusCode: 0, body: null, writeHead(s) { this.statusCode = s; return this; }, end(p) { this.body = p ? JSON.parse(p) : null; } };
}
const request = (method) => ({ method, headers: { authorization: 'Bearer t' }, socket: { remoteAddress: '1.2.3.4' } });
const verifySession = () => ({ userId: 'user-1' });
const grantPage = (ownerId) => async () => ({ row: { owner_id: ownerId } });

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

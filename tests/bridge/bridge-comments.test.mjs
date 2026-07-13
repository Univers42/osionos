/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-comments.test.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCommentsHandler } from '../../scripts/bridge-comments.mjs';

const config = { baasUrl: 'http://baas', serviceKey: 'k', allowedOrigin: 'http://app' };
const COMMENT_ID = '11111111-2222-4333-8444-555555555555';
const PAGE_ID = '99999999-2222-4333-8444-555555555555';

function mockResponse() {
	return {
		statusCode: 0, body: null,
		writeHead(status) { this.statusCode = status; return this; },
		end(payload) { this.body = payload ? JSON.parse(payload) : null; },
	};
}
const request = (method) => ({ method, headers: { authorization: 'Bearer t' } });
const verifySession = () => ({ userId: 'user-1' });

/** fetchImpl that reports the stored comment's author, and accepts writes. */
function fetchFor(commentAuthor) {
	return async (url) => ({
		ok: true, status: 200,
		text: async () => (String(url).includes('select=author_id') ? JSON.stringify([{ author_id: commentAuthor }]) : ''),
	});
}

describe('comments ACL', () => {
	it('403s when deleting a comment the caller does not own', async () => {
		const handler = createCommentsHandler({ config, verifySession, verifyPageAccess: async () => ({ row: {} }), fetchImpl: fetchFor('someone-else') });
		const res = mockResponse();
		await handler(new URL(`http://app/api/comments/${COMMENT_ID}`), request('DELETE'), res, config);
		assert.equal(res.statusCode, 403);
	});

	it('deletes a comment the caller owns', async () => {
		const handler = createCommentsHandler({ config, verifySession, verifyPageAccess: async () => ({ row: {} }), fetchImpl: fetchFor('user-1') });
		const res = mockResponse();
		await handler(new URL(`http://app/api/comments/${COMMENT_ID}`), request('DELETE'), res, config);
		assert.equal(res.statusCode, 200);
		assert.equal(res.body.ok, true);
	});

	it('propagates a 403 from verifyPageAccess when reading a page thread', async () => {
		const deny = async () => { throw Object.assign(new Error('Forbidden.'), { status: 403 }); };
		const handler = createCommentsHandler({ config, verifySession, verifyPageAccess: deny, fetchImpl: fetchFor('user-1') });
		const res = mockResponse();
		await handler(new URL(`http://app/api/comments?pageId=${PAGE_ID}`), request('GET'), res, config);
		assert.equal(res.statusCode, 403);
	});

	it('400s a list with no pageId', async () => {
		const handler = createCommentsHandler({ config, verifySession, verifyPageAccess: async () => ({ row: {} }), fetchImpl: fetchFor('user-1') });
		const res = mockResponse();
		await handler(new URL('http://app/api/comments'), request('GET'), res, config);
		assert.equal(res.statusCode, 400);
	});

	it('ignores paths outside /api/comments', async () => {
		const handler = createCommentsHandler({ config, verifySession, verifyPageAccess: async () => ({ row: {} }), fetchImpl: fetchFor('user-1') });
		const handled = await handler(new URL('http://app/api/pages'), request('GET'), mockResponse(), config);
		assert.equal(handled, false);
	});
});

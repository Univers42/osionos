/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   discussions-backend.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #228: the comments handler over the PostgREST mock, with the discussion columns seeded,
// and every realtime publish captured instead of sent.

import { Readable } from 'node:stream';
import { createCommentsHandler } from '../../../scripts/bridge-comments.mjs';
import { IDS, createPostgrestMock, harnessConfig, teamPage, teamWorld } from './bridge-harness.mjs';

export const config = harnessConfig();
export const PAGE = IDS.sharedA;
export const BLOCK = `${PAGE}-b1`;
export const CODE_BLOCK = `${PAGE}-code`;
export const OTHER_PAGE = IDS.sharedMemoA;

let serial = 0;

/** A comment row as the migrated table holds it (defaults of the #228 columns). */
export function commentRow(fields = {}) {
	serial += 1;
	const id = fields.id ?? `c0c0c0c0-0000-4000-8000-${String(serial).padStart(12, '0')}`;
	return {
		id, page_id: PAGE, block_id: BLOCK, author_id: IDS.userA, content: `comment ${serial}`, resolved_at: null,
		created_at: new Date(Date.UTC(2026, 9, 30, 0, 0, serial)).toISOString(), parent_id: null, kind: 'comment',
		anchor: null, suggestion: null, status: 'open', decided_by: null, decided_at: null, deleted_at: null,
		updated_at: '2026-10-30T00:00:00.000Z', ...fields,
	};
}

export function suggestionRow(fields = {}) {
	return commentRow({
		kind: 'suggestion', content: '', author_id: IDS.userB, suggestion: { insert: 'better' },
		anchor: { start: 0, end: 6, quote: 'shared', prefix: '', suffix: ' text' }, ...fields,
	});
}

export function discussionWorld(comments = [], reactions = []) {
	const seed = teamWorld({ memberRole: 'editor' });
	const page = seed.osionos_pages.find((row) => row.id === PAGE);
	page.content.push({ id: CODE_BLOCK, type: 'code', content: 'x = 1' });
	seed.osionos_page_comments = comments;
	seed.osionos_page_comment_reactions = reactions;
	return seed;
}

/** The mock, with every realtime publish captured instead of sent. */
export function backend(seed, options = {}) {
	const mock = createPostgrestMock(seed, options);
	const published = [];
	async function publishFetch(_url, init) {
		published.push(JSON.parse(init.body));
		return new Response('{}');
	}
	return { ...mock, publishFetch, published };
}

/**
 * The handler as `userId` with `access` from pageAccess; `access: null` is a bridge
 * without the injection (S13).
 */
export function handlerFor(be, { userId = IDS.userB, access = { level: 'can_comment', canWrite: false }, env = {} } = {}) {
	const pageAccess = access === null ? null : async (_request, pageId) => {
		const row = be.page(pageId);
		if (!row) throw Object.assign(new Error('Page not found.'), { status: 404 });
		return { row, ...access };
	};
	return createCommentsHandler({
		config,
		verifySession: () => ({ userId }),
		verifyPageAccess: async (_request, pageId) => ({ row: be.page(pageId) }),
		pageAccess,
		fetchImpl: be.fetchImpl,
		env: { REALTIME_PUBLISH_URL: 'http://realtime.test', ...env },
		publishFetch: be.publishFetch,
	});
}

/** One request through the handler: status and parsed body. */
export async function call(handler, method, path, body) {
	const request = Object.assign(Readable.from(body === undefined ? [] : [JSON.stringify(body)]), {
		method, headers: { authorization: 'Bearer t' },
	});
	const response = {
		status: 0, body: null,
		writeHead(status) { this.status = status; return this; },
		end(payload) { this.body = payload ? JSON.parse(payload) : null; },
	};
	await handler(new URL(`http://app${path}`), request, response, config);
	// announce() publishes without being awaited; let it reach publishFetch.
	await new Promise((done) => setImmediate(done));
	return response;
}

export { IDS, teamPage };

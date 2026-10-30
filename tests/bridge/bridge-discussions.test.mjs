/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-discussions.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #228 through /api/comments: who may reply, suggest, decide and react (S1, S6), the
// bounds (S10), the 404 before the migration (S13), edits and deletes of a decided or
// answered row (S3, S4), and what a held row hides (S9).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	BLOCK, CODE_BLOCK, IDS, OTHER_PAGE, PAGE, backend, call, commentRow, discussionWorld, handlerFor, suggestionRow,
} from './support/discussions-backend.mjs';

const ANCHOR = { start: 0, end: 6, quote: 'shared', prefix: '', suffix: ' text' };
const proposal = (extra = {}) => ({ pageId: PAGE, blockId: BLOCK, kind: 'suggestion', anchor: ANCHOR, suggestion: { insert: 'common' }, ...extra });
const comments = (be) => be.rows('osionos_page_comments');

describe('S13: nothing of #228 answers before the migration', () => {
	it('a bridge without pageAccess 404s a suggestion and a decision, and lists plain rows', async () => {
		const be = backend(discussionWorld([suggestionRow()]));
		const handler = handlerFor(be, { access: null });
		assert.equal((await call(handler, 'POST', '/api/comments', proposal())).status, 404);
		const id = comments(be)[0].id;
		assert.equal((await call(handler, 'POST', `/api/comments/${id}/decision`, { verdict: 'accepted' })).status, 404);
		const list = await call(handler, 'GET', `/api/comments?pageId=${PAGE}`);
		assert.equal(list.status, 200);
		assert.equal('kind' in list.body.comments[0], false);
	});

	it('a database without the columns 404s the routes (the probe sees the 400)', async () => {
		const failWhen = (request) => (String(request.params.get('select')).startsWith('kind,') ? { status: 400, body: { code: '42703' } } : null);
		const be = backend(discussionWorld([commentRow()]), { failWhen });
		const handler = handlerFor(be);
		assert.equal((await call(handler, 'POST', '/api/comments', proposal())).status, 404);
		assert.equal((await call(handler, 'PUT', `/api/comments/${comments(be)[0].id}/reactions/%F0%9F%91%8D`)).status, 404);
	});

	it('a legacy comment still posts with no #228 field', async () => {
		const be = backend(discussionWorld());
		const created = await call(handlerFor(be, { access: null }), 'POST', '/api/comments', { pageId: PAGE, blockId: BLOCK, content: 'hi' });
		assert.equal(created.status, 200, JSON.stringify(created.body));
	});
});

describe('S6, S10: posting a suggestion', () => {
	it('can_view is refused; can_comment writes an open suggestion and announces ids only', async () => {
		const be = backend(discussionWorld());
		assert.equal((await call(handlerFor(be, { access: { level: 'can_view', canWrite: false } }), 'POST', '/api/comments', proposal())).status, 403);
		const created = await call(handlerFor(be), 'POST', '/api/comments', proposal({ status: 'accepted', author_id: IDS.userA }));
		assert.equal(created.status, 200, JSON.stringify(created.body));
		const [row] = comments(be);
		assert.equal(row.kind, 'suggestion');
		assert.equal(row.author_id, IDS.userB, 'the author is the session, never the body');
		assert.equal(row.status, undefined, 'the client never sets status');
		assert.deepEqual(row.suggestion, { insert: 'common' });
		assert.deepEqual(be.published.map((event) => event.topic), [`collabpage:${PAGE}`]);
		assert.deepEqual(be.published[0].payload, { pageId: PAGE, commentId: row.id, change: 'created' });
	});

	it('a missing block, a code block and a malformed anchor are 400s', async () => {
		const handler = handlerFor(backend(discussionWorld()));
		const statuses = [
			await call(handler, 'POST', '/api/comments', proposal({ blockId: 'nope' })),
			await call(handler, 'POST', '/api/comments', proposal({ blockId: CODE_BLOCK })),
			await call(handler, 'POST', '/api/comments', proposal({ anchor: { ...ANCHOR, quote: 'share' } })),
			await call(handler, 'POST', '/api/comments', proposal({ suggestion: { insert: 'é'.repeat(4001) } })),
		].map((result) => result.status);
		assert.deepEqual(statuses, [400, 400, 400, 400]);
	});

	it('the 21st open suggestion of one author on one block is a 429', async () => {
		const open = Array.from({ length: 20 }, () => suggestionRow());
		const handler = handlerFor(backend(discussionWorld(open)));
		assert.equal((await call(handler, 'POST', '/api/comments', proposal())).status, 429);
	});
});

describe('replies', () => {
	it('answer a visible root of the same page, never a reply, another page or a held row', async () => {
		const root = commentRow();
		const reply = commentRow({ parent_id: root.id });
		const elsewhere = commentRow({ page_id: OTHER_PAGE });
		const held = commentRow({ moderation_state: 'held' });
		const be = backend(discussionWorld([root, reply, elsewhere, held]));
		const handler = handlerFor(be);
		const post = (parentId, extra = {}) => call(handler, 'POST', '/api/comments', { pageId: PAGE, blockId: BLOCK, parentId, content: 'yes', ...extra });
		assert.equal((await post(reply.id)).status, 400);
		assert.equal((await post(elsewhere.id)).status, 400);
		assert.equal((await post(held.id)).status, 400);
		assert.equal((await post(root.id, proposal())).status, 400, 'a suggestion starts its own thread');
		assert.equal((await post(root.id)).status, 200);
		assert.equal(comments(be).at(-1).parent_id, root.id);
	});
});

describe('S1, C8: deciding a suggestion', () => {
	function deciding(result = { ok: true, status: 'accepted', supersededIds: [], rebasedIds: [] }) {
		const calls = [];
		const row = suggestionRow();
		const be = backend(discussionWorld([row, commentRow({ id: 'c1c1c1c1-0000-4000-8000-000000000001' })]), {
			rpc: { osionos_decide_suggestion: (body) => { calls.push(body); return result; } },
		});
		return { be, row, calls };
	}

	it('accept needs the page write; the author may reject their own', async () => {
		const { be, row, calls } = deciding();
		const commenter = handlerFor(be, { userId: IDS.userA });
		assert.equal((await call(commenter, 'POST', `/api/comments/${row.id}/decision`, { verdict: 'accepted' })).status, 403);
		assert.equal((await call(commenter, 'POST', `/api/comments/${row.id}/decision`, { verdict: 'rejected' })).status, 403);
		const author = handlerFor(be);
		assert.equal((await call(author, 'POST', `/api/comments/${row.id}/decision`, { verdict: 'accepted' })).status, 403);
		assert.equal((await call(author, 'POST', `/api/comments/${row.id}/decision`, { verdict: 'rejected' })).status, 200);
		assert.equal(calls.length, 1);
	});

	it('an editor accepts: the decider is the session, the version guard is passed through', async () => {
		const { be, row, calls } = deciding();
		const editor = handlerFor(be, { userId: IDS.userA, access: { level: 'can_edit', canWrite: true } });
		const result = await call(editor, 'POST', `/api/comments/${row.id}/decision`, { verdict: 'accepted', p_decider: IDS.userB, expectedUpdatedAt: '2026-10-30T00:00:00.000Z' });
		assert.equal(result.status, 200);
		assert.deepEqual(calls[0], { p_id: row.id, p_decider: IDS.userA, p_verdict: 'accepted', p_expected_updated_at: '2026-10-30T00:00:00.000Z' });
		assert.deepEqual(be.published[0].payload, { pageId: PAGE, commentId: row.id, change: 'accepted' });
	});

	it('a refusal maps to its status and reason; nothing is announced', async () => {
		for (const [reason, status] of [['stale', 409], ['decided', 409], ['changed', 409], ['missing', 404]]) {
			const { be, row } = deciding({ ok: false, reason, status: 'open' });
			const editor = handlerFor(be, { access: { level: 'can_edit', canWrite: true } });
			const result = await call(editor, 'POST', `/api/comments/${row.id}/decision`, { verdict: 'accepted' });
			assert.equal(result.status, status, reason);
			assert.equal(result.body.reason, reason);
			assert.equal(be.published.length, 0);
		}
	});

	it('a plain comment, a bad verdict and a bad guard are refused before the RPC', async () => {
		const { be, row, calls } = deciding();
		const editor = handlerFor(be, { access: { level: 'can_edit', canWrite: true } });
		assert.equal((await call(editor, 'POST', '/api/comments/c1c1c1c1-0000-4000-8000-000000000001/decision', { verdict: 'accepted' })).status, 404);
		assert.equal((await call(editor, 'POST', `/api/comments/${row.id}/decision`, { verdict: 'maybe' })).status, 400);
		assert.equal((await call(editor, 'POST', `/api/comments/${row.id}/decision`, { verdict: 'accepted', expectedUpdatedAt: 'soon' })).status, 400);
		assert.equal(calls.length, 0);
	});
});

describe('reactions (S9)', () => {
	it('PUT is idempotent, DELETE takes only the caller\'s, the list counts per emoji', async () => {
		const root = commentRow();
		const be = backend(discussionWorld([root], [{ comment_id: root.id, user_id: IDS.userA, emoji: '👍' }]));
		const handler = handlerFor(be);
		const path = `/api/comments/${root.id}/reactions/${encodeURIComponent('👍')}`;
		assert.equal((await call(handler, 'PUT', path)).status, 200);
		assert.equal((await call(handler, 'PUT', path)).status, 200);
		let list = await call(handler, 'GET', `/api/comments?pageId=${PAGE}`);
		assert.deepEqual(list.body.comments[0].reactions, [{ emoji: '👍', count: 2, mine: true }]);
		assert.equal((await call(handler, 'DELETE', path)).status, 200);
		list = await call(handler, 'GET', `/api/comments?pageId=${PAGE}`);
		assert.deepEqual(list.body.comments[0].reactions, [{ emoji: '👍', count: 1, mine: false }]);
	});

	it('a held row of someone else is a 404 and its reactions are counted for nobody', async () => {
		const held = commentRow({ moderation_state: 'held' });
		const be = backend(discussionWorld([held, commentRow()], [{ comment_id: held.id, user_id: IDS.userA, emoji: '👍' }]));
		const handler = handlerFor(be, { env: { OSIONOS_MODERATION_STATE: '1' } });
		assert.equal((await call(handler, 'PUT', `/api/comments/${held.id}/reactions/x`)).status, 404);
		const list = await call(handler, 'GET', `/api/comments?pageId=${PAGE}`);
		assert.deepEqual(list.body.comments.map((comment) => comment.id), [comments(be)[1].id]);
		assert.equal(be.rows('osionos_page_comment_reactions').length, 1);
	});

	it('a viewer may not react and an emoji with a space is a 400', async () => {
		const root = commentRow();
		const be = backend(discussionWorld([root]));
		assert.equal((await call(handlerFor(be, { access: { level: 'can_view', canWrite: false } }), 'PUT', `/api/comments/${root.id}/reactions/x`)).status, 403);
		assert.equal((await call(handlerFor(be), 'PUT', `/api/comments/${root.id}/reactions/a%20b`)).status, 400);
	});
});

describe('S3, S4: editing and deleting your own row', () => {
	it('a decided suggestion is neither edited nor deleted (409 decided)', async () => {
		const row = suggestionRow({ status: 'accepted' });
		const handler = handlerFor(backend(discussionWorld([row])));
		const edit = await call(handler, 'PATCH', `/api/comments/${row.id}`, { suggestion: { insert: 'other' } });
		assert.deepEqual([edit.status, edit.body.reason], [409, 'decided']);
		assert.equal((await call(handler, 'DELETE', `/api/comments/${row.id}`)).status, 409);
	});

	it('an open suggestion takes a new insert', async () => {
		const row = suggestionRow();
		const be = backend(discussionWorld([row]));
		assert.equal((await call(handlerFor(be), 'PATCH', `/api/comments/${row.id}`, { suggestion: { insert: 'other' } })).status, 200);
		assert.deepEqual(comments(be)[0].suggestion, { insert: 'other' });
	});

	it('a root with replies is blanked and kept; one without is deleted', async () => {
		const root = commentRow({ author_id: IDS.userB });
		const lone = commentRow({ author_id: IDS.userB });
		const reply = commentRow({ parent_id: root.id });
		const failWhen = (request) => (request.method === 'DELETE' && request.params.get('id') === `eq.${root.id}`
			? { status: 409, body: { code: '23503', message: 'a comment with replies is kept' } } : null);
		const be = backend(discussionWorld([root, lone, reply]), { failWhen });
		const handler = handlerFor(be);
		assert.equal((await call(handler, 'DELETE', `/api/comments/${root.id}`)).body.deleted, 'soft');
		assert.equal((await call(handler, 'DELETE', `/api/comments/${lone.id}`)).body.deleted, 'deleted');
		const kept = comments(be).find((row) => row.id === root.id);
		assert.equal(kept.content, '');
		assert.notEqual(kept.deleted_at, null);
		assert.equal(comments(be).some((row) => row.id === lone.id), false);
		const list = await call(handler, 'GET', `/api/comments?pageId=${PAGE}`);
		assert.equal(list.body.comments.find((row) => row.id === root.id).deleted, true);
	});
});

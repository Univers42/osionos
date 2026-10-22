/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-comment-moderation.test.mjs                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The gate on the two comment surfaces: the feed and the page thread.
 *
 * L0 runs BEFORE the write. A warning is the author's question (409, nothing
 * written); a hold is a comment written HELD and seen by its author alone; and
 * the flag OSIONOS_MODERATION_STATE=1 is what says the state column and the
 * audit table exist at all — without it the bridge never names them.
 *
 * The blocklisted word is READ from the list at runtime, never pasted here: the
 * test must follow the list, not a copy of it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, teamPage, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const PUBLIC_ID = 'c3c3c3c3-3333-4333-8333-c3c3c3c3c3c3';
const PRIVATE_ID = 'c4c4c4c4-4444-4444-8444-c4c4c4c4c4c4';
const COMMENT_ID = 'd1d1d1d1-1111-4111-8111-d1d1d1d1d1d1';

const LIST = readFileSync(new URL('../../scripts/moderation-lists/en.txt', import.meta.url), 'utf8')
	.split('\n')
	.map((line) => line.trim())
	.filter((line) => line.length > 0);
const TERM = LIST.find((term) => /^[a-z]{4,}$/.test(term));
const BLOCKED = `what a ${TERM} you are`;
const LINK_FLOOD = [
	'https://one.example/a', 'https://two.example/b', 'https://three.example/c',
	'https://four.example/d', 'https://five.example/e', 'https://six.example/f',
].join(' ');

/** The mode alone: the shadow. The mode and the state flag: the enforcement. */
const HOLD = { OSIONOS_MODERATION_ACTIONS: 'hold' };
const HOLD_STATE = { OSIONOS_MODERATION_ACTIONS: 'hold', OSIONOS_MODERATION_STATE: '1' };
const STATE_ONLY = { OSIONOS_MODERATION_STATE: '1' };

const feedPath = (pageId) => `/api/feed/${pageId}/comments`;
const pagePath = (pageId) => `/api/comments?pageId=${pageId}`;

/** A world with a public post, a private one, and the comments it is given. */
function world({ comments = [], pageComments = [], workspacePublic = false } = {}) {
	const w = teamWorld();
	w.osionos_pages.push(teamPage(PUBLIC_ID, IDS.userA, 'public', 'A public post', 'public text'));
	w.osionos_pages.push(teamPage(PRIVATE_ID, IDS.userA, 'private', 'A private post', 'private text'));
	w.osionos_feed_comments = comments;
	w.osionos_page_comments = pageComments;
	w.osionos_workspaces = workspacePublic ? [{ id: IDS.team, visibility: 'public' }] : [];
	return w;
}

const heldComment = (table) => ({
	id: COMMENT_ID,
	page_id: PUBLIC_ID,
	author_id: IDS.userA,
	content: 'a held comment',
	created_at: '2026-10-01T00:00:00.000Z',
	moderation_state: 'held',
	...(table === 'page' ? { block_id: null } : {}),
});

const inserts = (mock, table) => mock.calls.filter((call) => call.method === 'POST' && call.table === table);
const audits = (mock) => mock.calls.filter((call) => call.table === 'ai_moderation_events');
const publishes = (mock) => mock.outbound.filter((url) => url.includes('/v1/publish'));

/** Every call the bridge made: its URL, its table and its body. */
function spoken(mock) {
	return mock.calls.map((call) => `${call.table}?${call.params.toString()} ${JSON.stringify(call.body ?? {})}`).join('\n');
}

describe('the feed comment gate', () => {
	it('hold mode + a blocklisted word: 409, and NOTHING is written', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, feedPath(PUBLIC_ID), sessionHeaders(config, IDS.userB, IDS.homeB), post({ content: BLOCKED }));
			assert.equal(answer.status, 409, answer.text);
			assert.equal(answer.body.ok, false);
			assert.equal(answer.body.code, 'moderation_warning');
			assert.deepEqual(answer.body.reasons, ['blocklist']);
			assert.deepEqual(answer.body.terms, [TERM]);
			assert.equal(inserts(mock, 'osionos_feed_comments').length, 0);
			assert.equal(audits(mock).length, 0);
		}, { env: HOLD });
	});

	it('the author may post it anyway: the comment is written', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, feedPath(PUBLIC_ID), sessionHeaders(config, IDS.userB, IDS.homeB), post({ content: BLOCKED, acknowledgeWarning: true }));
			assert.equal(answer.status, 201, answer.text);
			assert.equal(answer.body.moderationState, 'visible');
			const insert = inserts(mock, 'osionos_feed_comments')[0];
			assert.ok(insert);
			assert.equal(insert.body.moderation_state, undefined);
		}, { env: HOLD });
	});

	it('a link flood on a public post is written HELD, and nobody is told', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, feedPath(PUBLIC_ID), sessionHeaders(config, IDS.userB, IDS.homeB), post({ content: LINK_FLOOD }));
			assert.equal(answer.status, 201, answer.text);
			assert.equal(answer.body.moderationState, 'held');
			const insert = inserts(mock, 'osionos_feed_comments')[0];
			assert.equal(insert.body.moderation_state, 'held');
			// Nobody is notified: a held comment is the author's alone.
			await new Promise((resolve) => setTimeout(resolve, 50));
			assert.equal(inserts(mock, 'osionos_notifications').length, 0);
			assert.equal(publishes(mock).length, 0);
			// The audit says it happened, and says nothing about the words.
			const audit = audits(mock);
			assert.equal(audit.length, 1);
			assert.equal(audit[0].body.layer, 'l0');
			assert.equal(audit[0].body.action, 'hold');
			assert.equal(audit[0].body.reason, 'links');
			assert.ok(!JSON.stringify(audit[0].body).includes(LINK_FLOOD));
		}, { env: HOLD_STATE });
	});

	it('a comment that is NOT held still tells the owner (the control)', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			await send(base, feedPath(PUBLIC_ID), sessionHeaders(config, IDS.userB, IDS.homeB), post({ content: 'a plain comment' }));
			await new Promise((resolve) => setTimeout(resolve, 50));
			assert.equal(inserts(mock, 'osionos_notifications').length, 1);
			assert.equal(publishes(mock).length, 1);
		}, { env: HOLD_STATE });
	});

	it('the flag unset: the bridge never names moderation_state or ai_moderation_events', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const headers = sessionHeaders(config, IDS.userB, IDS.homeB);
			const answer = await send(base, feedPath(PUBLIC_ID), headers, post({ content: LINK_FLOOD }));
			assert.equal(answer.status, 201, answer.text);
			// The READERS too: the list and the comment count are filtered by the
			// same column, so a filter without the flag would name it here.
			await send(base, feedPath(PUBLIC_ID), headers);
			await send(base, `/api/feed/${PUBLIC_ID}/reactions`, headers);
			assert.ok(!spoken(mock).includes('moderation_state'), spoken(mock));
			assert.ok(!spoken(mock).includes('ai_moderation_events'), spoken(mock));
		}, { env: { OSIONOS_MODERATION_ACTIONS: 'log' } });
	});

	it('the flag set: the list carries the or= filter of the session user', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			await send(base, feedPath(PUBLIC_ID), sessionHeaders(config, IDS.userB, IDS.homeB));
			const list = mock.calls.find((call) => call.table === 'osionos_feed_comments' && call.method === 'GET' && call.params.get('select') === '*');
			assert.ok(list, 'the comment list did not happen');
			assert.equal(list.params.get('or'), `(moderation_state.eq.visible,author_id.eq.${IDS.userB})`);
		}, { env: STATE_ONLY });
	});

	it('a held comment is the author\'s alone', async () => {
		const mock = createPostgrestMock(world({ comments: [heldComment('feed')] }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const mine = await send(base, feedPath(PUBLIC_ID), sessionHeaders(config, IDS.userA, IDS.homeA));
			assert.equal(mine.status, 200, mine.text);
			assert.equal(mine.body.comments.length, 1);
			assert.equal(mine.body.comments[0].moderationState, 'held');
			const theirs = await send(base, feedPath(PUBLIC_ID), sessionHeaders(config, IDS.userB, IDS.homeB));
			assert.equal(theirs.body.comments.length, 0);
		}, { env: STATE_ONLY });
	});

	it('an edit of a held comment with a clean text never un-holds it', async () => {
		const mock = createPostgrestMock(world({ comments: [heldComment('feed')] }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, `/api/feed/${PUBLIC_ID}/comments/${COMMENT_ID}`, sessionHeaders(config, IDS.userA, IDS.homeA), { method: 'PUT', body: JSON.stringify({ content: 'a clean edit' }) });
			assert.equal(answer.status, 200, answer.text);
			const edit = mock.calls.find((call) => call.method === 'PATCH' && call.table === 'osionos_feed_comments');
			assert.ok(edit);
			assert.equal(edit.body.moderation_state, undefined);
			assert.equal(mock.rows('osionos_feed_comments')[0].moderation_state, 'held');
		}, { env: HOLD_STATE });
	});
});

describe('the page comment gate', () => {
	it('hold mode + a blocklisted word: 409, and NOTHING is written', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/comments', sessionHeaders(config, IDS.userB, IDS.homeB), post({ pageId: PUBLIC_ID, content: BLOCKED }));
			assert.equal(answer.status, 409, answer.text);
			assert.equal(answer.body.code, 'moderation_warning');
			assert.deepEqual(answer.body.reasons, ['blocklist']);
			assert.equal(inserts(mock, 'osionos_page_comments').length, 0);
			assert.equal(audits(mock).length, 0);
		}, { env: HOLD });
	});

	it('the author may post it anyway: the comment is written', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/comments', sessionHeaders(config, IDS.userB, IDS.homeB), post({ pageId: PUBLIC_ID, content: BLOCKED, acknowledgeWarning: true }));
			assert.equal(answer.status, 200, answer.text);
			assert.equal(answer.body.comment.moderationState, 'visible');
			const insert = inserts(mock, 'osionos_page_comments')[0];
			assert.ok(insert);
			assert.equal(insert.body.moderation_state, undefined);
		}, { env: HOLD });
	});

	it('a link flood on a public page is written HELD, and nobody is told', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/comments', sessionHeaders(config, IDS.userB, IDS.homeB), post({ pageId: PUBLIC_ID, content: LINK_FLOOD }));
			assert.equal(answer.status, 200, answer.text);
			assert.equal(answer.body.comment.moderationState, 'held');
			const insert = inserts(mock, 'osionos_page_comments')[0];
			assert.equal(insert.body.moderation_state, 'held');
			assert.equal(inserts(mock, 'osionos_notifications').length, 0);
			const audit = audits(mock);
			assert.equal(audit.length, 1);
			assert.equal(audit[0].body.action, 'hold');
			assert.equal(audit[0].body.reason, 'links');
		}, { env: HOLD_STATE });
	});

	it('a comment that is NOT held still notifies the owner (the control)', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			await send(base, '/api/comments', sessionHeaders(config, IDS.userB, IDS.homeB), post({ pageId: PUBLIC_ID, content: 'a plain comment' }));
			assert.equal(inserts(mock, 'osionos_notifications').length, 1);
		}, { env: HOLD_STATE });
	});

	it('the flag unset: the bridge never names moderation_state or ai_moderation_events', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const headers = sessionHeaders(config, IDS.userB, IDS.homeB);
			const answer = await send(base, '/api/comments', headers, post({ pageId: PUBLIC_ID, content: LINK_FLOOD }));
			assert.equal(answer.status, 200, answer.text);
			// The READER too: the list is filtered by the same column.
			await send(base, pagePath(PUBLIC_ID), headers);
			assert.ok(!spoken(mock).includes('moderation_state'), spoken(mock));
			assert.ok(!spoken(mock).includes('ai_moderation_events'), spoken(mock));
		}, { env: { OSIONOS_MODERATION_ACTIONS: 'log' } });
	});

	it('the flag set: the list carries the or= filter of the session user', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			await send(base, pagePath(PUBLIC_ID), sessionHeaders(config, IDS.userB, IDS.homeB));
			const list = mock.calls.find((call) => call.table === 'osionos_page_comments' && call.method === 'GET');
			assert.ok(list, 'the comment list did not happen');
			assert.equal(list.params.get('or'), `(moderation_state.eq.visible,author_id.eq.${IDS.userB})`);
		}, { env: STATE_ONLY });
	});

	it('a held comment is the author\'s alone', async () => {
		const mock = createPostgrestMock(world({ pageComments: [heldComment('page')] }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const mine = await send(base, pagePath(PUBLIC_ID), sessionHeaders(config, IDS.userA, IDS.homeA));
			assert.equal(mine.status, 200, mine.text);
			assert.equal(mine.body.comments.length, 1);
			assert.equal(mine.body.comments[0].moderationState, 'held');
			const theirs = await send(base, pagePath(PUBLIC_ID), sessionHeaders(config, IDS.userB, IDS.homeB));
			assert.equal(theirs.body.comments.length, 0);
		}, { env: STATE_ONLY });
	});

	it('an edit of a held comment with a clean text never un-holds it', async () => {
		const mock = createPostgrestMock(world({ pageComments: [heldComment('page')] }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, `/api/comments/${COMMENT_ID}`, sessionHeaders(config, IDS.userA, IDS.homeA), { method: 'PATCH', body: JSON.stringify({ content: 'a clean edit' }) });
			assert.equal(answer.status, 200, answer.text);
			const edit = mock.calls.find((call) => call.method === 'PATCH' && call.table === 'osionos_page_comments');
			assert.ok(edit);
			assert.equal(edit.body.moderation_state, undefined);
			assert.equal(mock.rows('osionos_page_comments')[0].moderation_state, 'held');
		}, { env: HOLD_STATE });
	});

	it('a resolved-only PATCH is not checked', async () => {
		const mock = createPostgrestMock(world({ pageComments: [heldComment('page')] }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, `/api/comments/${COMMENT_ID}`, sessionHeaders(config, IDS.userA, IDS.homeA), { method: 'PATCH', body: JSON.stringify({ resolved: true }) });
			assert.equal(answer.status, 200, answer.text);
			const edit = mock.calls.find((call) => call.method === 'PATCH' && call.table === 'osionos_page_comments');
			assert.equal(edit.body.content, undefined);
			assert.equal(edit.body.moderation_state, undefined);
		}, { env: HOLD_STATE });
	});
});

describe('a private post is never held and never recorded (C94)', () => {
	it('the feed: the link flood is a warning, not a hold', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, feedPath(PRIVATE_ID), sessionHeaders(config, IDS.userA, IDS.homeA), post({ content: LINK_FLOOD }));
			assert.equal(answer.status, 409, answer.text);
			assert.equal(answer.body.code, 'moderation_warning');
			assert.equal(inserts(mock, 'osionos_feed_comments').length, 0);
			assert.equal(audits(mock).length, 0);
		}, { env: HOLD_STATE });
	});

	it('the page: the link flood is a warning, not a hold', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/comments', sessionHeaders(config, IDS.userA, IDS.homeA), post({ pageId: PRIVATE_ID, content: LINK_FLOOD }));
			assert.equal(answer.status, 409, answer.text);
			assert.equal(inserts(mock, 'osionos_page_comments').length, 0);
			assert.equal(audits(mock).length, 0);
		}, { env: HOLD_STATE });
	});

	it('a public WORKSPACE makes a private page public-readable', async () => {
		const mock = createPostgrestMock(world({ workspacePublic: true }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, feedPath(PRIVATE_ID), sessionHeaders(config, IDS.userA, IDS.homeA), post({ content: LINK_FLOOD }));
			assert.equal(answer.status, 201, answer.text);
			assert.equal(answer.body.moderationState, 'held');
			assert.equal(audits(mock).length, 1);
		}, { env: HOLD_STATE });
	});
});

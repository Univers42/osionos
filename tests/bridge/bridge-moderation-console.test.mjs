/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-moderation-console.test.mjs                   :+:      :+:    :+:   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * THE CONSOLE: what an admin reviews (the held comments, the open reports) and
 * what an admin decides (hide, restore, dismiss, resolve).
 *
 * What the routes must hold:
 *   - C91: the session's `isAdmin` claim is a hint. The DATABASE decides, on
 *     every call: a token without the claim never reaches the database, a token
 *     WITH the claim and a row that says false is refused, and a row that
 *     cannot be read is a 503 — never "allowed".
 *   - C86: a hide or a restore moves the STATE, never the content. The comment
 *     stays exactly as its author wrote it.
 *   - C92: an admin reading a user's words is audited, and the audit row is
 *     written BEFORE the answer.
 *   - the flag: without OSIONOS_MODERATION_STATE the console never names
 *     moderation_state, and a hide is a 409 instead of a write.
 *   - nothing is ever DELETED.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createModerationConsoleHandler } from '../../scripts/bridge-moderation-console.mjs';
import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();

const ADMIN = 'adadadad-1111-4111-8111-adadadadadad';
/** The burst has an administrator of its own: the bucket is per user, and it is shared. */
const BURST_ADMIN = 'f0f0f0f0-1111-4111-8111-f0f0f0f0f0f0';
const AUTHOR = 'bdbdbdbd-2222-4222-8222-bdbdbdbdbdbd';
const FEED_COMMENT = 'c1c1c1c1-1111-4111-8111-c1c1c1c1c1c1';
const PAGE_COMMENT = 'c2c2c2c2-2222-4222-8222-c2c2c2c2c2c2';
const REPORT = 'd1d1d1d1-1111-4111-8111-d1d1d1d1d1d1';
const MISSING = 'e1e1e1e1-1111-4111-8111-e1e1e1e1e1e1';

/** The state flag: the moderation state column and the audit table exist. */
const STATE = { OSIONOS_MODERATION_STATE: '1' };

/**
 * The world the console reads: an administrator, an author, a held comment on
 * each surface, an open report about the held one, and the audit rows of the
 * holds. The audit rows come NEWEST FIRST: the mock keeps the insertion order
 * for an `order` it does not know, and the console reads the first row it is
 * given for a subject.
 */
function world(extra = {}) {
	return {
		osionos_bridge_identities: [{ user_id: ADMIN, is_admin: true }],
		osionos_feed_comments: [{
			id: FEED_COMMENT, page_id: IDS.pageB, author_id: AUTHOR, content: 'a held feed comment',
			created_at: '2026-10-20T00:00:00.000Z', moderation_state: 'held', moderation_changed_at: '2026-10-20T00:01:00.000Z',
		}],
		osionos_page_comments: [{
			id: PAGE_COMMENT, page_id: IDS.pageB, author_id: AUTHOR, content: 'a held page comment',
			created_at: '2026-10-19T00:00:00.000Z', moderation_state: 'held', moderation_changed_at: '2026-10-19T00:01:00.000Z',
		}],
		osionos_user_reports: [{
			id: REPORT, reporter_id: AUTHOR, subject_user_id: AUTHOR, subject_kind: 'feed_comment',
			subject_id: FEED_COMMENT, category: 'spam', details: 'a spam comment', status: 'open',
			created_at: '2026-10-21T00:00:00.000Z',
		}],
		ai_moderation_events: [
			{ id: 2, ts: '2026-10-20T00:02:00.000Z', subject_kind: 'feed_comment', subject_id: FEED_COMMENT, layer: 'l0', action: 'hold', reason: 'links', scores: { verdict: 'hold' } },
			{ id: 1, ts: '2026-10-19T00:02:00.000Z', subject_kind: 'page_comment', subject_id: PAGE_COMMENT, layer: 'l0', action: 'hold', reason: 'blocklist', scores: { verdict: 'hold' } },
		],
		...extra,
	};
}

/** Every call the bridge made: its URL, its table and its body. */
function spoken(mock) {
	return mock.calls.map((call) => `${call.table}?${call.params.toString()} ${JSON.stringify(call.body ?? {})}`).join('\n');
}

/** One call to the console — and the promise that no call was a DELETE. */
async function ask(mock, base, path, headers, init = {}) {
	const answer = await send(base, path, headers, init);
	assert.ok(mock.calls.every((call) => call.method !== 'DELETE'), `a DELETE reached the database:\n${spoken(mock)}`);
	return answer;
}

/** The headers of an administrator: the token carries the claim. */
const adminHeaders = (userId = ADMIN) => sessionHeaders(config, userId, IDS.homeA, [], true);

describe('the console and the administrator claim (C91)', () => {
	it('a token WITHOUT the claim: 403, and not one call to the database', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const headers = sessionHeaders(config, ADMIN, IDS.homeA);
			const answer = await ask(mock, base, '/api/admin/moderation/queue', headers);
			assert.equal(answer.status, 403);
			assert.equal(answer.body.code, 'admin_required');
			assert.deepEqual(mock.calls, []);
		}, { env: STATE });
	});

	it('a token WITH the claim but a row that says false: 403, and nothing is written (the stale claim)', async () => {
		const mock = createPostgrestMock(world({ osionos_bridge_identities: [{ user_id: ADMIN, is_admin: false }] }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await ask(mock, base, '/api/admin/moderation/decision', adminHeaders(), post({ kind: 'feed_comment', id: FEED_COMMENT, decision: 'hide' }));
			assert.equal(answer.status, 403);
			assert.equal(answer.body.code, 'admin_required');
			assert.equal(mock.calls.filter((call) => call.method === 'PATCH').length, 0);
			assert.equal(mock.rows('osionos_feed_comments')[0].moderation_state, 'held');
		}, { env: STATE });
	});

	it('a row that cannot be read: 503, never "allowed"', async () => {
		const mock = createPostgrestMock(world(), {
			failWhen: (call) => (call.table === 'osionos_bridge_identities' ? { status: 500, body: { message: 'the database is down' } } : null),
		});
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await ask(mock, base, '/api/admin/moderation/queue', adminHeaders());
			assert.equal(answer.status, 503);
			assert.equal(answer.body.code, 'admin_check_failed');
			assert.equal(mock.calls.filter((call) => call.method === 'PATCH').length, 0);
		}, { env: STATE });
	});
});

describe('the queue', () => {
	it('the open reports, with their reporter and their subject', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await ask(mock, base, '/api/admin/moderation/queue', adminHeaders());
			assert.equal(answer.status, 200, answer.text);
			assert.equal(answer.body.reports.length, 1);
			const report = answer.body.reports[0];
			assert.equal(report.id, REPORT);
			assert.equal(report.reporterId, AUTHOR);
			assert.equal(report.subjectKind, 'feed_comment');
			assert.equal(report.subjectId, FEED_COMMENT);
			assert.equal(report.category, 'spam');
			assert.equal(report.status, 'open');
			assert.equal(report.createdAt, '2026-10-21T00:00:00.000Z');
			// The newest first, and no more than fifty.
			const read = mock.calls.find((call) => call.table === 'osionos_user_reports');
			assert.equal(read.params.get('order'), 'created_at.desc');
			assert.equal(read.params.get('limit'), '50');
		}, { env: STATE });
	});

	it('a closed report is not in the queue', async () => {
		const mock = createPostgrestMock(world({ osionos_user_reports: [{ id: REPORT, reporter_id: AUTHOR, subject_kind: 'feed_comment', subject_id: FEED_COMMENT, category: 'spam', status: 'resolved', created_at: '2026-10-21T00:00:00.000Z' }] }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await ask(mock, base, '/api/admin/moderation/queue', adminHeaders());
			assert.deepEqual(answer.body.reports, []);
		}, { env: STATE });
	});

	it('the held comments of both surfaces, with their reason codes — and NO content', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await ask(mock, base, '/api/admin/moderation/queue', adminHeaders());
			assert.equal(answer.status, 200, answer.text);
			assert.equal(answer.body.held.length, 2);
			const feed = answer.body.held.find((item) => item.subjectKind === 'feed_comment');
			assert.equal(feed.id, FEED_COMMENT);
			assert.equal(feed.authorId, AUTHOR);
			assert.equal(feed.createdAt, '2026-10-20T00:00:00.000Z');
			assert.equal(feed.moderationChangedAt, '2026-10-20T00:01:00.000Z');
			assert.equal(feed.audit.layer, 'l0');
			assert.equal(feed.audit.action, 'hold');
			assert.equal(feed.audit.reason, 'links');
			assert.deepEqual(feed.audit.scores, { verdict: 'hold' });
			// The queue NEVER carries the words.
			assert.ok(!JSON.stringify(answer.body).includes('a held feed comment'), JSON.stringify(answer.body));
			assert.ok(!JSON.stringify(answer.body).includes('a held page comment'), JSON.stringify(answer.body));
		}, { env: STATE });
	});
});

describe('the item', () => {
	it('the content, the state and the audit of the subject', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await ask(mock, base, `/api/admin/moderation/item?kind=feed_comment&id=${FEED_COMMENT}`, adminHeaders());
			assert.equal(answer.status, 200, answer.text);
			assert.equal(answer.body.content, 'a held feed comment');
			assert.equal(answer.body.state, 'held');
			assert.equal(answer.body.authorId, AUTHOR);
			assert.equal(answer.body.createdAt, '2026-10-20T00:00:00.000Z');
			// The audit of the subject: the hold, and the reading that just happened.
			assert.equal(answer.body.audit.length, 2);
			assert.ok(answer.body.audit.some((row) => row.action === 'hold' && row.layer === 'l0'));
			assert.ok(answer.body.audit.some((row) => row.action === 'view' && row.layer === 'admin'));
		}, { env: STATE });
	});

	it('the reading is audited BEFORE the answer (C92)', async () => {
		const mock = createPostgrestMock(world());
		const { body, seen } = await callHandler(mock, `/api/admin/moderation/item?kind=feed_comment&id=${FEED_COMMENT}`);
		assert.equal(body.content, 'a held feed comment');
		assert.equal(seen.length, 1, 'the reading was not audited');
		assert.equal(seen[0].answered, false, 'the answer came before the audit row');
		assert.ok(mock.calls.every((call) => call.method !== 'DELETE'), 'a DELETE reached the database');
	});

	it('an unknown id: 404', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await ask(mock, base, `/api/admin/moderation/item?kind=feed_comment&id=${MISSING}`, adminHeaders());
			assert.equal(answer.status, 404);
			assert.equal(answer.body.code, 'not_found');
		}, { env: STATE });
	});

	it('another kind: 422 — this slice is the two comment tables', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await ask(mock, base, `/api/admin/moderation/item?kind=message&id=${FEED_COMMENT}`, adminHeaders());
			assert.equal(answer.status, 422);
			assert.equal(answer.body.code, 'unknown_kind');
		}, { env: STATE });
	});
});

describe('the decisions', () => {
	it('hide: the state is removed, the audit says who, and the reports are resolved', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await ask(mock, base, '/api/admin/moderation/decision', adminHeaders(), post({ kind: 'feed_comment', id: FEED_COMMENT, decision: 'hide', reason: 'spam' }));
			assert.equal(answer.status, 200, answer.text);
			// The PATCH: the state and when it changed, and nothing else. The
			// CONTENT is not touched (C86).
			const patch = mock.calls.find((call) => call.method === 'PATCH' && call.table === 'osionos_feed_comments');
			assert.ok(patch, 'the comment was not patched');
			assert.deepEqual(Object.keys(patch.body).sort(), ['moderation_changed_at', 'moderation_state']);
			assert.equal(patch.body.moderation_state, 'removed');
			assert.equal(typeof patch.body.moderation_changed_at, 'string');
			assert.equal(mock.rows('osionos_feed_comments')[0].content, 'a held feed comment');
			// The audit: the admin layer, the admin as the actor, no content.
			const audit = mock.calls.filter((call) => call.method === 'POST' && call.table === 'ai_moderation_events');
			assert.equal(audit.length, 1);
			assert.equal(audit[0].body.layer, 'admin');
			assert.equal(audit[0].body.action, 'remove');
			assert.equal(audit[0].body.actor_id, ADMIN);
			assert.equal(audit[0].body.author_id, AUTHOR);
			assert.equal(audit[0].body.reason, 'spam');
			assert.equal(audit[0].body.content, undefined);
			assert.ok(!JSON.stringify(audit[0].body).includes('a held feed comment'));
			// The reports about that subject are answered by the answer.
			const reports = mock.calls.find((call) => call.method === 'PATCH' && call.table === 'osionos_user_reports');
			assert.ok(reports, 'the report was not answered');
			assert.deepEqual(reports.body, { status: 'resolved' });
			assert.equal(mock.rows('osionos_user_reports')[0].status, 'resolved');
		}, { env: STATE });
	});

	it('restore: the state is visible again, and the audit says restore', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await ask(mock, base, '/api/admin/moderation/decision', adminHeaders(), post({ kind: 'page_comment', id: PAGE_COMMENT, decision: 'restore', reason: 'report_unfounded' }));
			assert.equal(answer.status, 200, answer.text);
			const patch = mock.calls.find((call) => call.method === 'PATCH' && call.table === 'osionos_page_comments');
			assert.ok(patch);
			assert.equal(patch.body.moderation_state, 'visible');
			assert.equal(mock.rows('osionos_page_comments')[0].moderation_state, 'visible');
			// The content is exactly as the author wrote it (C86).
			assert.equal(mock.rows('osionos_page_comments')[0].content, 'a held page comment');
			const audit = mock.calls.filter((call) => call.method === 'POST' && call.table === 'ai_moderation_events');
			assert.equal(audit.length, 1);
			assert.equal(audit[0].body.action, 'restore');
			assert.equal(audit[0].body.layer, 'admin');
			assert.equal(audit[0].body.reason, 'report_unfounded');
		}, { env: STATE });
	});

	it('dismiss a report: its status is the answer, and there is no audit row', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await ask(mock, base, '/api/admin/moderation/decision', adminHeaders(), post({ kind: 'report', id: REPORT, decision: 'dismiss', reason: 'report_unfounded' }));
			assert.equal(answer.status, 200, answer.text);
			const patch = mock.calls.find((call) => call.method === 'PATCH' && call.table === 'osionos_user_reports');
			assert.ok(patch);
			assert.deepEqual(patch.body, { status: 'dismissed' });
			assert.equal(mock.rows('osionos_user_reports')[0].status, 'dismissed');
			assert.equal(mock.calls.filter((call) => call.method === 'POST' && call.table === 'ai_moderation_events').length, 0);
		}, { env: STATE });
	});

	it('a reason outside the closed list: 422, and nothing is written', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await ask(mock, base, '/api/admin/moderation/decision', adminHeaders(), post({ kind: 'feed_comment', id: FEED_COMMENT, decision: 'hide', reason: 'because' }));
			assert.equal(answer.status, 422);
			assert.equal(answer.body.code, 'unknown_reason');
			assert.equal(mock.calls.filter((call) => call.method === 'PATCH').length, 0);
		}, { env: STATE });
	});

	it('the flag unset: the console never names moderation_state, and a hide is a 409', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const headers = adminHeaders();
			const queue = await ask(mock, base, '/api/admin/moderation/queue', headers);
			assert.equal(queue.status, 200, queue.text);
			assert.deepEqual(queue.body.held, []);
			assert.ok(!spoken(mock).includes('moderation_state'), spoken(mock));
			const answer = await ask(mock, base, '/api/admin/moderation/decision', headers, post({ kind: 'feed_comment', id: FEED_COMMENT, decision: 'hide' }));
			assert.equal(answer.status, 409);
			assert.equal(answer.body.code, 'moderation_state_disabled');
			assert.equal(mock.calls.filter((call) => call.method === 'PATCH').length, 0);
		}, { env: {} });
	});
});

describe('the burst', () => {
	it('the sixty-first call: 429', async () => {
		const mock = createPostgrestMock(world({ osionos_bridge_identities: [{ user_id: BURST_ADMIN, is_admin: true }] }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const headers = adminHeaders(BURST_ADMIN);
			const statuses = [];
			// The cheapest route: the burst must not depend on the size of the queue.
			for (let call = 0; call < 61; call += 1) {
				const answer = await ask(mock, base, `/api/admin/moderation/item?kind=feed_comment&id=${MISSING}`, headers);
				statuses.push(answer.status);
			}
			assert.deepEqual(statuses.slice(0, 60), Array(60).fill(404));
			assert.equal(statuses[60], 429);
		}, { env: STATE });
	});
});

/**
 * The handler called directly, so the test can see WHEN the answer was written:
 * the mock records, for every audit insert, whether the response had already
 * been sent. A reading audited after the answer is a reading nobody audited.
 */
async function callHandler(mock, path, { method = 'GET', body, isAdmin = true } = {}) {
	let answered = false;
	const seen = [];
	const fetchImpl = async (url, init = {}) => {
		const record = { url: String(url), method: init.method ?? 'GET', answered };
		const answer = await mock.fetchImpl(url, init);
		if (record.method === 'POST' && record.url.includes('ai_moderation_events')) seen.push(record);
		return answer;
	};
	const handler = createModerationConsoleHandler({
		config,
		verifySession: () => ({ userId: ADMIN, isAdmin }),
		fetchImpl,
		env: STATE,
	});
	const request = {
		method,
		headers: { authorization: 'Bearer test' },
		...(body === undefined ? {} : { async *[Symbol.asyncIterator]() { yield JSON.stringify(body); } }),
	};
	const captured = {};
	const response = {
		writeHead: (status) => { captured.status = status; },
		end: (text) => { captured.text = text; captured.body = JSON.parse(text); answered = true; },
	};
	captured.handled = await handler(new URL(`http://bridge.test${path}`), request, response);
	return { ...captured, seen };
}

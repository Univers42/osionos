/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-reports.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The report route decides what a report may name: the subject is resolved server-side,
// the reporter must be able to read it, one report per reporter and subject, and the
// answer never says whether a subject exists (a missing subject and a subject the
// reporter cannot read answer the same bytes). A strict PostgREST stub
// (support/social-postgrest.mjs) answers only the declared queries.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSocialStub, getReports, postReport, uid } from './support/social-postgrest.mjs';

const WS = uid(101); // the workspace the page lives in
const OTHER_WS = uid(102); // a workspace the reporter is not in
const OWNER = uid(11); // the page owner
const AUTHOR = uid(12); // the message / comment author
const PAGE = uid(201);
const HIDDEN_PAGE = uid(202);
const ARCHIVED_PAGE = uid(203);
const MESSAGE = uid(301);
const CHANNEL = uid(302);
const COMMENT = uid(401);

/** A directory row (the table the user report resolves against). */
const person = (user_id) => ({ user_id, display_name: 'Ada', profile: {}, last_seen_at: null });

/** A page row: id, workspace_id, owner_id, visibility, collaborators, archived_at. */
const page = (id, workspace_id, over = {}) => ({
	id, workspace_id, owner_id: OWNER, visibility: 'shared', collaborators: [], archived_at: null, ...over,
});

/** The stored world of the stub. Every test uses its own reporter (the rate limit is per reporter). */
function world(setup = {}) {
	return { connections: [], blocks: [], ...setup };
}

describe('POST /api/social/reports', () => {
	it('reports: an unknown subject kind answers 422 and inserts nothing', async () => {
		const me = uid(1001);
		const stub = createSocialStub(world());
		const answer = await postReport(stub, me, { subjectKind: 'planet', subjectId: OWNER, category: 'abuse' });
		assert.equal(answer.status, 422);
		assert.deepEqual(answer.body, { ok: false, message: 'Unknown report subject.' });
		assert.deepEqual(stub.posts(), []);
	});

	it('reports: a user report with only subjectUserId still files (the contact menu shape)', async () => {
		const me = uid(1002);
		const stub = createSocialStub(world({ people: [person(OWNER)] }));
		const answer = await postReport(stub, me, { subjectUserId: OWNER, subjectKind: 'user', category: 'abuse' });
		assert.equal(answer.status, 201);
		assert.equal(answer.body.ok, true);
		assert.equal(answer.body.report.subjectUserId, OWNER);
		assert.equal(stub.posts().length, 1);
		assert.equal(stub.posts()[0].body.subject_id, OWNER);
		assert.equal(stub.posts()[0].body.subject_user_id, OWNER);
	});

	it('reports: a page report names the page owner, not the uuid the body sends', async () => {
		const me = uid(1003);
		const stub = createSocialStub(world({
			members: [{ workspace_id: WS, user_id: me }],
			pages: [page(PAGE, WS)],
		}));
		const answer = await postReport(stub, me, { subjectKind: 'page', subjectId: PAGE, subjectUserId: AUTHOR, category: 'abuse' });
		assert.equal(answer.status, 201);
		assert.equal(stub.posts().length, 1);
		assert.equal(stub.posts()[0].body.subject_id, PAGE);
		assert.equal(stub.posts()[0].body.subject_user_id, OWNER);
	});

	it('reports: an unreadable page and a missing one answer the same 404, byte for byte', async () => {
		const me = uid(1004);
		const stub = createSocialStub(world({ pages: [page(HIDDEN_PAGE, OTHER_WS)] }));
		const hidden = await postReport(stub, me, { subjectKind: 'page', subjectId: HIDDEN_PAGE });
		const missing = await postReport(stub, me, { subjectKind: 'page', subjectId: uid(999) });
		assert.equal(hidden.status, 404);
		assert.equal(missing.status, 404);
		assert.equal(hidden.text, missing.text);
		assert.equal(hidden.text, JSON.stringify({ ok: false, message: 'Nothing to report here.' }));
		assert.deepEqual(stub.posts(), []);
	});

	it('reports: an archived page answers 404', async () => {
		const me = uid(1005);
		const stub = createSocialStub(world({
			members: [{ workspace_id: WS, user_id: me }],
			pages: [page(ARCHIVED_PAGE, WS, { archived_at: '2026-10-01T00:00:00.000Z' })],
		}));
		const answer = await postReport(stub, me, { subjectKind: 'page', subjectId: ARCHIVED_PAGE });
		assert.equal(answer.status, 404);
		assert.equal(answer.body.message, 'Nothing to report here.');
		assert.deepEqual(stub.posts(), []);
	});

	it('reports: a message in a channel the reporter is not in answers 404', async () => {
		const me = uid(1006);
		const stub = createSocialStub(world({
			messages: [{ id: MESSAGE, author_id: AUTHOR, channel_id: CHANNEL }],
			channels: [{ id: CHANNEL, workspace_id: WS, kind: 'text', name: 'private', is_private: true, created_by: OWNER }],
			channelMembers: [],
		}));
		const answer = await postReport(stub, me, { subjectKind: 'message', subjectId: MESSAGE });
		assert.equal(answer.status, 404);
		assert.equal(answer.text, JSON.stringify({ ok: false, message: 'Nothing to report here.' }));
		assert.deepEqual(stub.posts(), []);
	});

	it('reports: a comment report names the comment author', async () => {
		const me = uid(1007);
		const stub = createSocialStub(world({
			members: [{ workspace_id: WS, user_id: me }],
			pages: [page(PAGE, WS)],
			feedComments: [{ id: COMMENT, author_id: AUTHOR, page_id: PAGE }],
		}));
		const answer = await postReport(stub, me, { subjectKind: 'feed_comment', subjectId: COMMENT });
		assert.equal(answer.status, 201);
		assert.equal(stub.posts().length, 1);
		assert.equal(stub.posts()[0].body.subject_user_id, AUTHOR);
	});

	it('reports: the same subject twice answers duplicate the second time and inserts once', async () => {
		const me = uid(1008);
		const stub = createSocialStub(world({ people: [person(OWNER)] }));
		const first = await postReport(stub, me, { subjectKind: 'user', subjectId: OWNER });
		const second = await postReport(stub, me, { subjectKind: 'user', subjectId: OWNER });
		assert.equal(first.status, 201);
		assert.equal(second.status, 200);
		assert.equal(second.body.duplicate, true);
		assert.equal(second.body.reportId, first.body.reportId);
		assert.equal(stub.posts().length, 1);
	});

	it('reports: an insert that loses the unique race answers duplicate', async () => {
		const me = uid(1009);
		const stub = createSocialStub(world({ people: [person(OWNER)] }), { conflictInsert: true });
		const answer = await postReport(stub, me, { subjectKind: 'user', subjectId: OWNER });
		assert.equal(answer.status, 200);
		assert.equal(answer.body.duplicate, true);
		assert.equal(stub.posts().length, 1);
	});

	it('reports: the eleventh report in an hour answers 429', async () => {
		const me = uid(1010);
		const targets = Array.from({ length: 11 }, (_, index) => uid(2100 + index));
		const stub = createSocialStub(world({ people: targets.map(person) }));
		const answers = [];
		for (const target of targets) answers.push(await postReport(stub, me, { subjectKind: 'user', subjectId: target }));
		assert.deepEqual(answers.map((answer) => answer.status), [201, 201, 201, 201, 201, 201, 201, 201, 201, 201, 429]);
		assert.equal(stub.posts().length, 10);
	});

	it('reports: a subject read that fails answers 5xx, not 404', async () => {
		const me = uid(1011);
		const stub = createSocialStub(world({
			members: [{ workspace_id: WS, user_id: me }],
			pages: [page(PAGE, WS)],
		}), { failing: ['page'] });
		const answer = await postReport(stub, me, { subjectKind: 'page', subjectId: PAGE });
		assert.notEqual(answer.status, 404);
		assert.ok(answer.status >= 500);
		assert.deepEqual(stub.posts(), []);
	});

	it('reports: GET lists the reporter\'s own reports', async () => {
		const me = uid(1012);
		const stored = {
			id: uid(700), reporter_id: me, subject_user_id: OWNER, subject_kind: 'user',
			subject_id: OWNER, category: 'abuse', details: null, status: 'open', created_at: '2026-10-22T12:00:00.000Z',
		};
		const stub = createSocialStub(world({ reports: [stored] }));
		const answer = await getReports(stub, me);
		assert.equal(answer.status, 200);
		assert.equal(answer.body.reports.length, 1);
		assert.equal(answer.body.reports[0].id, stored.id);
		assert.equal(answer.body.reports[0].subjectUserId, OWNER);
		assert.equal(answer.body.reports[0].subjectKind, 'user');
	});
});

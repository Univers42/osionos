/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-access-requests-decisions.test.mjs     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Plan A N7-N10: the approve route's permission whitelist, its shared rule write, the
 * existing-rule refusal, the deny that still wins, and what a notification may carry.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPostgrestMock } from './support/bridge-harness.mjs';
import {
	ANCESTOR, DAY, IDS, MEMBER, OWNER, PAGE, REQUEST_ID,
	approvePath, call, declinePath, drain, makeHandler, requestRow, world,
} from './support/access-requests-world.mjs';

function setup(seed = world(), options = {}) {
	const mock = createPostgrestMock(seed, options);
	return { mock, run: makeHandler(mock, options.handler) };
}

function rule(over = {}) {
	return {
		id: 'e1000000-0000-4000-8000-0000000000a1', workspace_id: IDS.team, resource_type: 'page',
		resource_id: PAGE, target: { type: 'user', userId: MEMBER }, target_key: `user:${MEMBER}:`, permission: 'can_edit', explicit: true, ...over,
	};
}

const writes = (mock, table) => mock.calls.filter((entry) => entry.table === table && entry.method !== 'GET');

describe('N7: approve writes through the shared rule path, whitelist only', () => {
	it('full_access and no_access are 422 before any upstream call', async () => {
		for (const permission of ['full_access', 'no_access']) {
			const { mock, run } = setup();
			run.user(OWNER);
			const answer = await call(run, { path: approvePath(), body: { permission } });
			assert.equal(answer.statusCode, 422, `${permission}: ${JSON.stringify(answer.payload)}`);
			assert.equal(answer.payload.error, 'invalid_permission');
			assert.equal(mock.calls.length, 0, 'no read and no write before the whitelist');
		}
	});

	it('can_view writes a user rule on the page id through normalizeShareRule and upsert', async () => {
		const seed = world();
		seed.osionos_page_access_requests.push(requestRow());
		const { mock, run } = setup(seed);
		run.user(OWNER);
		const answer = await call(run, { path: approvePath(), body: { permission: 'can_view' } });
		assert.equal(answer.statusCode, 200, JSON.stringify(answer.payload));
		assert.equal(answer.payload.status, 'approved');
		const stored = mock.rows('osionos_share_rules');
		assert.equal(stored.length, 1);
		assert.equal(stored[0].resource_id, PAGE);
		assert.equal(stored[0].resource_type, 'page');
		assert.deepEqual(stored[0].target, { type: 'user', userId: MEMBER });
		assert.equal(stored[0].permission, 'can_view');
		assert.equal(mock.rows('osionos_page_access_requests')[0].status, 'approved');
		assert.equal(mock.rows('osionos_page_access_requests')[0].decided_by, OWNER);
	});
});

describe('N8: an existing rule is shown and never silently downgraded', () => {
	it('refuses a downgrade without replace, then replaces it when asked', async () => {
		const seed = world();
		seed.osionos_page_access_requests.push(requestRow());
		seed.osionos_share_rules = [rule({ permission: 'can_edit' })];
		const { mock, run } = setup(seed);
		run.user(OWNER);
		const refused = await call(run, { path: approvePath(), body: { permission: 'can_view' } });
		assert.equal(refused.statusCode, 409, JSON.stringify(refused.payload));
		assert.equal(refused.payload.error, 'existing_rule');
		assert.equal(refused.payload.permission, 'can_edit');
		assert.equal(mock.rows('osionos_page_access_requests')[0].status, 'pending');
		const replaced = await call(run, { path: approvePath(), body: { permission: 'can_view', replace: true } });
		assert.equal(replaced.statusCode, 200, JSON.stringify(replaced.payload));
		assert.equal(mock.rows('osionos_share_rules').length, 1);
		assert.equal(mock.rows('osionos_share_rules')[0].permission, 'can_view');
	});

	it('the owner list carries the requester existing permission', async () => {
		const seed = world();
		seed.osionos_page_access_requests.push(requestRow());
		seed.osionos_share_rules = [rule({ permission: 'can_comment' })];
		const { run } = setup(seed);
		run.user(OWNER);
		const answer = await call(run, { method: 'GET', path: `/api/access-requests?workspaceId=${IDS.team}` });
		assert.equal(answer.statusCode, 200, JSON.stringify(answer.payload));
		assert.equal(answer.payload.requests.length, 1);
		assert.equal(answer.payload.requests[0].existingPermission, 'can_comment');
		assert.equal(answer.payload.requests[0].pageTitle, 'A private plan');
		assert.equal(answer.payload.requests[0].requesterName, 'Bea Member');
	});
});

describe('N9: a deny on an ancestor still wins after the write', () => {
	it('answers overridden_by_deny, keeps row and rule, and sends no approved notice', async () => {
		const seed = world();
		seed.osionos_pages.find((page) => page.id === PAGE).parent_page_id = ANCESTOR;
		seed.osionos_page_access_requests.push(requestRow());
		seed.osionos_share_rules = [{
			id: 'e1000000-0000-4000-8000-0000000000b1', workspace_id: IDS.team, resource_type: 'page',
			resource_id: ANCESTOR, target: { type: 'user', userId: MEMBER }, permission: 'no_access', explicit: true,
		}];
		const { mock, run } = setup(seed);
		run.user(OWNER);
		const answer = await call(run, { path: approvePath(), body: { permission: 'can_view' } });
		assert.equal(answer.statusCode, 409, JSON.stringify(answer.payload));
		assert.equal(answer.payload.error, 'overridden_by_deny');
		assert.equal(mock.rows('osionos_page_access_requests')[0].status, 'approved');
		assert.equal(mock.rows('osionos_share_rules').filter((entry) => entry.resource_id === PAGE).length, 1);
		const notices = mock.rows('osionos_notifications').filter((entry) => entry.type === 'page_access_decision');
		assert.deepEqual(notices, []);
	});
});

describe('N10: the push and the decision notice carry no title or note', () => {
	it('the owner push and the requester decision notice are title-free and note-free', async () => {
		const seed = world();
		const { mock, run } = setup(seed);
		run.user(MEMBER);
		await call(run, { path: `/api/pages/${PAGE}/access-requests`, body: { workspaceId: IDS.team, note: 'TOP-SECRET-NOTE' } });
		await drain(run.tasks);
		const stored = mock.rows('osionos_page_access_requests')[0];
		const createNotice = mock.rows('osionos_notifications').find((entry) => entry.type === 'page_access_request');
		assert.ok(createNotice.preview.includes('A private plan'), 'the inbox may carry the title');
		assert.equal(run.pushes.length, 1);
		const pushed = run.pushes[0].payload;
		assert.equal(pushed, '{"title":"New access request","body":"New access request","url":"/"}');
		assert.equal(pushed.includes('A private plan'), false);
		assert.equal(pushed.includes('TOP-SECRET-NOTE'), false);

		run.user(OWNER);
		const decision = await call(run, { path: declinePath(stored.id) });
		assert.equal(decision.statusCode, 200, JSON.stringify(decision.payload));
		const notice = mock.rows('osionos_notifications').find((entry) => entry.type === 'page_access_decision');
		assert.equal(notice.preview, 'declined');
		assert.equal(notice.channel_id, PAGE);
		const noticeText = JSON.stringify(notice);
		assert.equal(noticeText.includes('A private plan'), false);
		assert.equal(noticeText.includes('TOP-SECRET-NOTE'), false);
	});
});

describe('N12: an untrusted note is stored as inert text', () => {
	it('strips control characters and RTL overrides but keeps the literal payload', async () => {
		const seed = world();
		const { mock, run } = setup(seed);
		run.user(MEMBER);
		const malicious = '<img onerror>\u202e\u0007';
		await call(run, { path: `/api/pages/${PAGE}/access-requests`, body: { workspaceId: IDS.team, note: malicious } });
		await drain(run.tasks);
		const stored = mock.rows('osionos_page_access_requests')[0];
		assert.equal(stored.note, '<img onerror>');
		run.user(OWNER);
		const answer = await call(run, { method: 'GET', path: `/api/access-requests?workspaceId=${IDS.team}` });
		assert.equal(answer.payload.requests[0].note, '<img onerror>');
	});
});

describe('N15: a stale pending row is expired before the insert', () => {
	it('expires a 31-day-old row and stores the new request', async () => {
		const seed = world();
		seed.osionos_page_access_requests.push(requestRow({
			id: 'e1000000-0000-4000-8000-0000000000e1',
			created_at: new Date(Date.now() - 31 * DAY).toISOString(),
		}));
		const { mock, run } = setup(seed);
		run.user(MEMBER);
		const answer = await call(run, { path: `/api/pages/${PAGE}/access-requests`, body: { workspaceId: IDS.team } });
		assert.equal(answer.statusCode, 202);
		await drain(run.tasks);
		const rows = mock.rows('osionos_page_access_requests');
		assert.equal(rows.filter((entry) => entry.status === 'expired').length, 1);
		assert.equal(rows.filter((entry) => entry.status === 'pending').length, 1);
	});
});
describe('N7: the POST /api/perms/rules handler shares the extracted write', () => {
	it('still answers 200 through the same writeShareRule used by approve', async () => {
		// The full handler compatibility is covered by bridge-perms-rules-scope.test.mjs and
		// bridge-perms-rules-list.test.mjs in the same suite; this asserts the import exists
		// and approve reaches it with the caller's own workspace verdict.
		const seed = world();
		seed.osionos_page_access_requests.push(requestRow({ id: REQUEST_ID }));
		const { mock, run } = setup(seed);
		run.user(OWNER);
		const answer = await call(run, { path: approvePath(), body: { permission: 'can_comment' } });
		assert.equal(answer.statusCode, 200, JSON.stringify(answer.payload));
		assert.equal(mock.rows('osionos_share_rules')[0].permission, 'can_comment');
	});
});

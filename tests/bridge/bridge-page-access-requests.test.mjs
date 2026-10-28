/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-access-requests.test.mjs               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Plan A N1-N6: who receives a request, which access decision reads it, the uniform 202,
 * attempt-based limits, blocks, and the decision re-checks. Each describe is titled with
 * its verdict condition.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPostgrestMock } from './support/bridge-harness.mjs';
import {
	DAY, IDS, MEMBER, OUTSIDER, OWNER, PAGE, REQUEST_ID, SHARED_PAGE, TESTER,
	approvePath, call, config, createAnswer, createPath, drain, fakeResponse, makeHandler, requestFor, requestRow, world,
} from './support/access-requests-world.mjs';

const randomPage = (index) => `d1000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const randomWorkspace = (index) => `d2000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

function setup(seed = world(), options = {}) {
	const mock = createPostgrestMock(seed, options);
	return { mock, run: makeHandler(mock, options.handler) };
}

function memberIds(seed, userId) {
	seed.osionos_workspace_members = seed.osionos_workspace_members.filter((row) => row.user_id !== userId);
}

describe('N1: only the page owner receives and decides', () => {
	it('a full-access rule holder is neither listed to nor able to decide', async () => {
		const seed = world();
		seed.osionos_page_access_requests.push(requestRow());
		seed.osionos_share_rules = [{
			id: 'e1000000-0000-4000-8000-0000000000f1', workspace_id: IDS.team, resource_type: 'page',
			resource_id: PAGE, target: { type: 'user', userId: MEMBER }, permission: 'full_access', explicit: true,
		}];
		const { run } = setup(seed);
		run.user(MEMBER);
		const list = await call(run, { method: 'GET', path: `/api/access-requests?workspaceId=${IDS.team}` });
		assert.equal(list.statusCode, 200, JSON.stringify(list.payload));
		assert.deepEqual(list.payload.requests, []);
		const decide = await call(run, { path: approvePath(), body: { permission: 'can_view' } });
		assert.equal(decide.statusCode, 404, JSON.stringify(decide.payload));
		assert.equal(decide.payload.error, 'request_not_found');
	});

	it('an owner who left the workspace cannot decide', async () => {
		const seed = world();
		seed.osionos_page_access_requests.push(requestRow());
		memberIds(seed, OWNER);
		const { run } = setup(seed);
		run.user(OWNER);
		const answer = await call(run, { path: approvePath(), body: { permission: 'can_view' } });
		assert.equal(answer.statusCode, 404, JSON.stringify(answer.payload));
	});

	it('a create for a page whose owner left stores nothing', async () => {
		const seed = world();
		memberIds(seed, OWNER);
		const { mock, run } = setup(seed);
		run.user(MEMBER);
		await call(run, { path: createPath(), body: { workspaceId: IDS.team } });
		await drain(run.tasks);
		assert.deepEqual(mock.rows('osionos_page_access_requests'), []);
	});
});

describe('N2: one access decision, live membership, never the token', () => {
	it('a token that lists the workspace is still a non-member without a members row', async () => {
		const seed = world();
		memberIds(seed, MEMBER);
		const { mock, run } = setup(seed);
		run.user(MEMBER);
		await call(run, { path: createPath(), body: { workspaceId: IDS.team } });
		await drain(run.tasks);
		assert.deepEqual(mock.rows('osionos_page_access_requests'), []);
	});

	it('an already readable page (visibility or a rule) is dropped', async () => {
		const seed = world();
		seed.osionos_share_rules = [{
			id: 'e1000000-0000-4000-8000-0000000000f2', workspace_id: IDS.team, resource_type: 'page',
			resource_id: PAGE, target: { type: 'user', userId: MEMBER }, permission: 'can_view', explicit: true,
		}];
		const { mock, run } = setup(seed);
		run.user(MEMBER);
		await call(run, { path: createPath(), body: { workspaceId: IDS.team } });
		await call(run, { path: createPath(SHARED_PAGE), body: { workspaceId: IDS.team } });
		await drain(run.tasks);
		assert.deepEqual(mock.rows('osionos_page_access_requests'), []);
	});
});

describe('N3: the same 202 for every case, work after the reply', () => {
	it('nonexistent / readable / non-member / stored / duplicate / capped / blocked / owner-left answer equal bytes', async () => {
		const answerFor = async (build, { user = MEMBER, pageId = PAGE } = {}) => {
			const { mock, run } = setup(build());
			run.user(user);
			const answer = await createAnswer(run, { pageId });
			await drain(run.tasks);
			return { answer, mock };
		};
		const results = [];
		const missingPage = randomPage(900);
		results.push(await answerFor(world, { pageId: missingPage, user: TESTER }));
		results.push(await answerFor(world, { pageId: SHARED_PAGE, user: TESTER }));
		results.push(await answerFor(world, { user: OUTSIDER }));
		results.push(await answerFor(world, { user: TESTER }));
		results.push(await answerFor(() => {
			const seed = world();
			seed.osionos_page_access_requests.push(requestRow({ id: 'e1000000-0000-4000-8000-0000000000d1', requester_id: TESTER }));
			return seed;
		}, { user: TESTER }));
		results.push(await answerFor(() => {
			const seed = world();
			seed.osionos_page_access_requests = Array.from({ length: 10 }, (_, index) => requestRow({
				id: `e1000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
				page_id: randomPage(index),
				requester_id: TESTER,
			}));
			return seed;
		}, { user: TESTER }));
		results.push(await answerFor(() => {
			const seed = world();
			seed.osionos_user_blocks = [{ blocker_id: TESTER, blocked_id: OWNER }];
			return seed;
		}, { user: TESTER }));
		results.push(await answerFor(() => {
			const seed = world();
			memberIds(seed, OWNER);
			return seed;
		}, { user: TESTER }));
		const answers = results.map((entry) => entry.answer);
		assert.equal(answers.length, 8);
		assert.deepEqual(new Set(answers.map((entry) => entry.status)), new Set([202]));
		assert.equal(new Set(answers.map((entry) => entry.text)).size, 1, 'one body for every case');
		assert.equal(answers[0].text, '{"ok":true}');
		assert.equal(results[3].mock.rows('osionos_page_access_requests').length, 1, 'the stored case stores');
		for (const index of [0, 1, 2, 4, 5, 6, 7]) {
			assert.equal(results[index].mock.rows('osionos_page_access_requests').length, index === 4 ? 1 : (index === 5 ? 10 : 0));
		}
	});

	it('sends the reply before the first upstream call', async () => {
		const mock = createPostgrestMock(world());
		const order = [];
		const raw = mock.fetchImpl;
		mock.fetchImpl = async (url, init) => { order.push('upstream'); return raw(url, init); };
		const run = makeHandler(mock);
		run.user(TESTER);
		const { response, finished } = fakeResponse(order);
		await run.handler(new URL(`http://app${createPath()}`), requestFor('POST', { workspaceId: IDS.team }, createPath()), response, config);
		await finished;
		assert.deepEqual(order, ['reply'], 'no upstream call before the reply');
		assert.equal(run.tasks.length, 1);
		await drain(run.tasks);
		assert.equal(order[0], 'reply');
		assert.ok(order.indexOf('upstream') > 0, 'the work runs after the reply');
	});
});

describe('N4: attempt buckets are the only 429s, the pending cap is silent', () => {
	it('a 429 comes from the bucket before any upstream call', async () => {
		const { mock, run } = setup(world());
		run.user('77777777-1111-4111-8111-777777777777');
		for (let index = 0; index < 30; index += 1) {
			const answer = await call(run, { path: createPath(), body: { workspaceId: randomWorkspace(index) } });
			assert.equal(answer.statusCode, 202, `call ${index}: ${JSON.stringify(answer.payload)}`);
		}
		const before = mock.calls.length;
		const limited = await call(run, { path: createPath(), body: { workspaceId: randomWorkspace(31) } });
		assert.equal(limited.statusCode, 429, JSON.stringify(limited.payload));
		assert.equal(limited.payload.error, 'rate_limited');
		assert.ok(limited.payload.retryAfterSeconds > 0);
		assert.equal(mock.calls.length, before, 'no upstream read for a refused attempt');
		assert.equal(run.tasks.length, 30, 'a refused attempt schedules nothing');
	});

	it('the 11th pending request in a workspace is dropped silently', async () => {
		const seed = world();
		seed.osionos_page_access_requests = Array.from({ length: 10 }, (_, index) => requestRow({
			id: `e1000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
			page_id: randomPage().replace('00aa', String(index).padStart(4, '0')),
		}));
		const { mock, run } = setup(seed);
		run.user(MEMBER);
		const answer = await call(run, { path: createPath(), body: { workspaceId: IDS.team } });
		assert.equal(answer.statusCode, 202);
		await drain(run.tasks);
		assert.equal(mock.rows('osionos_page_access_requests').length, 10);
	});
});

describe('N5: a block either way drops the request, and a broken block read fails closed', () => {
	for (const [label, blocker, blocked] of [
		['the requester blocked the owner', MEMBER, OWNER],
		['the owner blocked the requester', OWNER, MEMBER],
	]) {
		it(label, async () => {
			const seed = world();
			seed.osionos_user_blocks = [{ blocker_id: blocker, blocked_id: blocked }];
			const { mock, run } = setup(seed);
			run.user(MEMBER);
			await call(run, { path: createPath(), body: { workspaceId: IDS.team } });
			await drain(run.tasks);
			assert.deepEqual(mock.rows('osionos_page_access_requests'), []);
		});
	}

	it('a thrown block read drops and logs it', async () => {
		const { mock, run } = setup(world(), {
			failWhen: (request) => (request.table === 'osionos_user_blocks' ? { status: 500, body: { code: 'XX' } } : null),
		});
		run.user(MEMBER);
		await call(run, { path: createPath(), body: { workspaceId: IDS.team } });
		await drain(run.tasks);
		assert.deepEqual(mock.rows('osionos_page_access_requests'), []);
		assert.ok(run.logs.some((line) => line.includes('block check failed')), run.logs.join('\n'));
	});
});

describe('N6: the decision re-checks live state in order', () => {
	it('a non-owner cannot decide, a requester who left is closed, an expired row is closed', async () => {
		const nonOwner = world();
		nonOwner.osionos_page_access_requests.push(requestRow());
		const first = setup(nonOwner);
		first.run.user(MEMBER);
		assert.equal((await call(first.run, { path: approvePath(), body: { permission: 'can_view' } })).statusCode, 404);

		const requesterLeft = world();
		requesterLeft.osionos_page_access_requests.push(requestRow());
		memberIds(requesterLeft, MEMBER);
		const second = setup(requesterLeft);
		second.run.user(OWNER);
		const closed = await call(second.run, { path: approvePath(), body: { permission: 'can_view' } });
		assert.equal(closed.statusCode, 409, JSON.stringify(closed.payload));
		assert.equal(closed.payload.error, 'request_closed');

		const stale = world();
		stale.osionos_page_access_requests.push(requestRow({ created_at: new Date(Date.now() - 31 * DAY).toISOString() }));
		const third = setup(stale);
		third.run.user(OWNER);
		const expired = await call(third.run, { path: approvePath(), body: { permission: 'can_view' } });
		assert.equal(expired.statusCode, 409, JSON.stringify(expired.payload));
		assert.equal(expired.payload.error, 'request_closed');
		assert.equal(third.mock.rows('osionos_page_access_requests')[0].status, 'pending');
	});

	it('a block between owner and requester closes the request', async () => {
		const seed = world();
		seed.osionos_page_access_requests.push(requestRow({ id: REQUEST_ID }));
		seed.osionos_user_blocks = [{ blocker_id: MEMBER, blocked_id: OWNER }];
		const { run } = setup(seed);
		run.user(OWNER);
		const answer = await call(run, { path: approvePath(), body: { permission: 'can_view' } });
		assert.equal(answer.statusCode, 409, JSON.stringify(answer.payload));
		assert.equal(answer.payload.error, 'request_closed');
	});
});

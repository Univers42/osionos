/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   access-requests-world.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Direct-handler harness for the page access request tests: the bridge server runner is
// bypassed so a test can hold the detached create task, assert the reply came first, and
// await the work deterministically. The fakes (in-memory PostgREST, sessions, team world)
// are the shared bridge harness's.

import { Readable } from 'node:stream';
import {
	IDS, harnessConfig, teamPage, teamWorld,
} from './bridge-harness.mjs';
import { createPageAccessLoader, pageLevelFor } from '../../../scripts/bridge-api.mjs';
import { createPageAccessRequestsHandler } from '../../../scripts/bridge-page-access-requests.mjs';

export { IDS } from './bridge-harness.mjs';

export const config = harnessConfig();
export const OWNER = IDS.userA;
export const MEMBER = IDS.userB;
export const TESTER = '99999999-1111-4111-8111-999999999999';
export const ADMIN = 'cccccccc-3333-4333-8333-cccccccccccc';
export const OUTSIDER = 'ffffffff-6666-4666-8666-ffffffffffff';
export const PAGE = IDS.privateA;
export const SHARED_PAGE = IDS.sharedA;
export const REQUEST_ID = 'e1000000-0000-4000-8000-000000000001';
export const ANCESTOR = 'd1000000-0000-4000-8000-000000000100';
export const DAY = 24 * 60 * 60 * 1000;

/** The team world plus a directory and an empty request table. */
export function world() {
	const seed = teamWorld();
	seed.osionos_workspace_members.push({ workspace_id: IDS.team, user_id: TESTER, role: 'member', permissions: ['read'] });
	seed.osionos_people_directory = [
		{ user_id: OWNER, display_name: 'Ann Owner', profile: {} },
		{ user_id: MEMBER, display_name: 'Bea Member', profile: {} },
		{ user_id: TESTER, display_name: 'Tester Member', profile: {} },
	];
	seed.osionos_notifications = [];
	seed.osionos_page_access_requests = [];
	seed.osionos_pages.push(teamPage(ANCESTOR, OWNER, 'private', 'Parent', 'parent'));
	return seed;
}

export function requestRow(over = {}) {
	return {
		id: REQUEST_ID, workspace_id: IDS.team, page_id: PAGE, requester_id: MEMBER,
		note: null, status: 'pending', decided_by: null, decided_at: null,
		created_at: new Date(Date.now() - DAY).toISOString(), ...over,
	};
}

/** A fake ServerResponse: writeHead/end only, recording the exact bytes and status. */
export function fakeResponse(order = null) {
	let finish;
	const finished = new Promise((resolve) => { finish = resolve; });
	const response = {
		statusCode: 0, payload: null, headers: null,
		writeHead(status, headers) { this.statusCode = status; this.headers = headers; return this; },
		end(payload) {
			if (order) order.push('reply');
			this.payload = payload ? JSON.parse(payload) : null;
			finish(this);
			return this;
		},
	};
	return { response, finished };
}

export function requestFor(method, body, path = '/') {
	const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
	request.method = method;
	request.headers = { authorization: 'Bearer test-session' };
	request.url = path;
	return request;
}

/**
 * One handler with a mutable session, a task queue instead of setImmediate, and capturing
 * push/log sinks. `user(id)` switches who the next call is.
 */
export function makeHandler(mock, { now = Date.now, ruleStore, config: override } = {}) {
	let current = MEMBER;
	const tasks = [];
	const pushes = [];
	const logs = [];
	const handler = createPageAccessRequestsHandler({
		config: override ?? config,
		verifySession: () => ({ userId: current }),
		fetchImpl: mock.fetchImpl,
		createPageAccessLoader, pageLevelFor,
		...(ruleStore ? { ruleStore } : {}),
		push: async (_config, _fetchImpl, userId, payload) => { pushes.push({ userId, payload }); },
		schedule: (task) => tasks.push(task),
		log: (line) => logs.push(String(line)),
		now,
	});
	return {
		handler,
		tasks,
		pushes,
		logs,
		user: (id) => { current = id; },
	};
}

/** Run (and await) every task the handler detached, in order. */
export async function drain(tasks) {
	while (tasks.length) await tasks.shift()();
}

export async function call(run, { method = 'POST', path, body, order = null }) {
	const { response, finished } = fakeResponse(order);
	const url = new URL(`http://app${path}`);
	await run.handler(url, requestFor(method, body, path), response, config);
	await finished;
	return response;
}

export const createPath = (pageId = PAGE) => `/api/pages/${pageId}/access-requests`;
export const approvePath = (id = REQUEST_ID) => `/api/access-requests/${id}/approve`;
export const declinePath = (id = REQUEST_ID) => `/api/access-requests/${id}/decline`;

/** The raw bytes the create route answers with, for N3's equality check. */
export async function createAnswer(run, { pageId = PAGE, body = { workspaceId: IDS.team } } = {}) {
	const { response } = fakeResponse();
	const url = new URL(`http://app${createPath(pageId)}`);
	await run.handler(url, requestFor('POST', body, createPath(pageId)), response, config);
	const text = JSON.stringify(response.payload);
	return { status: response.statusCode, text, body: response.payload };
}

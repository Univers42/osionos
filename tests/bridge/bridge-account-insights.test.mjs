/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-insights.test.mjs                   +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The admin insights route and the owner's own activity source.
 *
 * What is proved here: the gates (flag, session, role re-read, rate limit, audit), that only
 * cells of 5 people or more leave the route, that the total is the sum of the shown cells,
 * that no per-user key reaches the answer, and that sys:my-activity returns the caller's rows.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bridgeHealthState } from '../../scripts/bridge-sessions.mjs';
import { SELF_SOURCES } from '../../scripts/bridge-self-sources.mjs';
import { send } from './support/account-world.mjs';
import { startAdminWorld } from './support/admin-route-world.mjs';
import { AUDIT, DAILY, USER_A, USER_B, cell, daysAgo, insightsWorld, tokenFor } from './support/insights-world.mjs';

const GRANTS = [{ userId: USER_A, role: 'admin' }, { userId: USER_B, role: 'user' }];
const CELLS = [cell(1, 'login', 'settings', 40, 12), cell(2, 'search', 'search', 9, 5), cell(3, 'export', 'settings', 3, 4), cell(3, 'share', 'editor', 1, 1)];

describe('the gates', () => {
	it('answers 404 when OSIONOS_ACTIVITY is unset', async (t) => {
		const world = await insightsWorld(t, { cells: CELLS });
		delete process.env.OSIONOS_ACTIVITY;
		assert.equal((await world.call('')).status, 404);
	});

	it('answers 401 without a session', async (t) => {
		const { call } = await insightsWorld(t, { cells: CELLS });
		assert.equal((await call('', { token: '' })).status, 401);
	});

	it('answers 403 admin_required to a non-admin, not 404 and not an empty 200', async (t) => {
		const { call, config } = await insightsWorld(t, { cells: CELLS, grants: GRANTS });
		const response = await call('', { token: tokenFor(config, USER_B) });
		assert.equal(response.status, 403);
		assert.equal(response.body.code, 'admin_required');
	});

	it('ignores an admin claim in the token when the database role is user', async (t) => {
		const { call, config } = await insightsWorld(t, { cells: CELLS, grants: GRANTS });
		assert.equal((await call('', { token: tokenFor(config, USER_B, true) })).status, 403);
	});

	it('re-reads the role: a grant revoked between two requests turns the second into 403', async (t) => {
		const { call, store } = await insightsWorld(t, { cells: CELLS });
		assert.equal((await call('')).status, 200);
		store.rows('user_roles').length = 0;
		assert.equal((await call('')).status, 403);
	});

	it('answers 429 after 30 reads in a minute', async (t) => {
		const { call } = await insightsWorld(t, { cells: CELLS });
		for (let n = 0; n < 30; n += 1) assert.equal((await call('')).status, 200);
		assert.equal((await call('')).status, 429);
	});

	it('leaves exactly one audit row per read, with a filter hash and no raw filter value', async (t) => {
		const { call, store } = await insightsWorld(t, { cells: CELLS });
		await call('?days=14&event=login');
		const rows = store.rows(AUDIT);
		assert.equal(rows.length, 1);
		assert.equal(rows[0].event_type, 'admin.insights_read');
		const hash = createHash('sha256').update(JSON.stringify({ days: 14, event: 'login', surface: null })).digest('hex');
		assert.deepEqual(rows[0].details, { filterHash: hash });
		assert.equal(JSON.stringify(rows[0]).includes('login'), false);
	});

	it('answers 503 and no cells when the audit row cannot be written', async (t) => {
		const { call } = await insightsWorld(t, { cells: CELLS, refuse: [AUDIT] });
		const response = await call('');
		assert.equal(response.status, 503);
		assert.equal(response.text.includes('cells'), false);
	});
});

describe('the query', () => {
	const refused = ['?from=2026-01-01', '?to=2026-01-02', '?granularity=week', '?granularity=month', '?days=6', '?days=91', '?days=abc', '?days=7.5', '?event=nope', '?surface=nope', '?foo=1', '?workspace_id=aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', '?scope=workspace'];
	for (const query of refused) {
		it(`refuses ${query} with 400 bad_query and writes no audit row`, async (t) => {
			const { call, store } = await insightsWorld(t, { cells: CELLS });
			const response = await call(query);
			assert.equal(response.status, 400);
			assert.equal(response.body.code, 'bad_query');
			assert.equal(store.rows(AUDIT).length, 0);
		});
	}

	it('accepts the day granularity and the 7 and 90 day bounds', async (t) => {
		const { call } = await insightsWorld(t, { cells: CELLS });
		for (const query of ['?granularity=day', '?days=7', '?days=90']) assert.equal((await call(query)).status, 200, query);
	});

	it('reads only the closed days of the window: today and older-than-window cells are not served', async (t) => {
		const cells = [cell(0, 'login', 'settings', 7, 9), cell(1, 'login', 'settings', 40, 12), cell(9, 'login', 'settings', 5, 8)];
		const { call } = await insightsWorld(t, { cells });
		const response = await call('?days=7');
		assert.deepEqual(response.body.cells.map((c) => c.day), [daysAgo(1)]);
	});
});

describe('suppression and the answer shape', () => {
	it('shows cells of 5 and 6 and never one of 1 or 4', async (t) => {
		const { call } = await insightsWorld(t, { cells: [...CELLS, cell(4, 'page_open', 'editor', 8, 6)] });
		const { body } = await call('');
		assert.deepEqual(body.cells.map((c) => c.users).sort(), [12, 5, 6]);
	});

	it('carries no suppression hint: no suppressedCells, no omitted count, no extra top-level key', async (t) => {
		const { call } = await insightsWorld(t, { cells: CELLS });
		const { body, text } = await call('');
		assert.deepEqual(Object.keys(body).sort(), ['cells', 'ok', 'totalOfShownCells']);
		assert.equal(/suppress|omitted|hidden|too_small/i.test(text), false);
	});

	it('answers a filter that matches nothing like any empty result', async (t) => {
		const { call } = await insightsWorld(t, { cells: CELLS });
		const { status, body } = await call('?event=database_view');
		assert.equal(status, 200);
		assert.deepEqual(body, { ok: true, cells: [], totalOfShownCells: 0 });
	});

	for (const query of ['', '?event=login', '?surface=settings', '?event=export&surface=settings', '?days=7']) {
		it(`totalOfShownCells equals the sum of the shown cells for ${query || 'no filter'}`, async (t) => {
			const { call } = await insightsWorld(t, { cells: CELLS });
			const { body } = await call(query);
			assert.equal(body.totalOfShownCells, body.cells.reduce((sum, c) => sum + c.events, 0));
		});
	}

	it('returns exact events and users per cell', async (t) => {
		const { call } = await insightsWorld(t, { cells: CELLS });
		const { body } = await call('?event=login');
		assert.deepEqual(body.cells, [{ day: daysAgo(1), event: 'login', surface: 'settings', events: 40, users: 12 }]);
	});

	it('carries no user_id, id, email or uuid anywhere in the parsed answer', async (t) => {
		const rows = CELLS.map((c) => ({ ...c, user_id: USER_B, id: USER_A, email: 'x@example.com' }));
		const { call } = await insightsWorld(t, { cells: rows });
		const { body } = await call('');
		const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		const walk = (value) => {
			if (Array.isArray(value)) return value.forEach(walk);
			if (value && typeof value === 'object') {
				for (const [key, inner] of Object.entries(value)) {
					assert.equal(['user_id', 'id', 'email', 'ts'].includes(key), false, key);
					walk(inner);
				}
				return;
			}
			assert.equal(typeof value === 'string' && uuid.test(value), false, String(value));
		};
		walk(body);
	});

	it('reads only the rollup: no request touches the raw activity table', async (t) => {
		const { call, store } = await insightsWorld(t, { cells: CELLS });
		await call('');
		assert.equal(store.callsTo('osionos_activity_events').length, 0);
		assert.equal(store.callsTo(DAILY).length, 1);
	});
});

describe('sys:my-activity', () => {
	const TABLE = 'osionos_activity_events';
	const row = (user, n) => ({ id: n, ts: `2026-10-${String(10 + (n % 15)).padStart(2, '0')}T00:00:00.000Z`, user_id: user, workspace_id: null, event: 'login', surface: 'settings' });

	async function ownWorld(t, { rows, failReads } = {}) {
		const world = await startAdminWorld(t, { path: '/api/account/self-data/my-activity', tables: { [TABLE]: rows }, failReads });
		return { ...world, tokenB: tokenFor(world.config, USER_B) };
	}

	it('is declared with the owner scope on user_id and an allowlist without user_id or id', () => {
		const source = SELF_SOURCES.find((entry) => entry.id === 'my-activity');
		assert.deepEqual(source.scope, { kind: 'owner', column: 'user_id' });
		assert.deepEqual(source.columns, ['ts', 'event', 'surface', 'workspace_id']);
	});

	it('returns the caller rows only: user B sees none of user A, and user_id never leaves', async (t) => {
		const { call, base, tokenB, store } = await ownWorld(t, { rows: [row(USER_A, 1), row(USER_A, 2), row(USER_B, 3)] });
		const a = await call('');
		assert.equal(a.status, 200);
		assert.equal(a.body.rows.length, 2);
		const b = await send(base, '/api/account/self-data/my-activity', { token: tokenB });
		assert.equal(b.body.rows.length, 1);
		for (const answer of [a, b]) assert.equal(/user_id|"id"/.test(JSON.stringify(answer.body.rows)), false);
		assert.equal(store.callsTo(TABLE).at(-1).params.get('user_id'), `eq.${USER_B}`);
	});

	it('truncates at 200 rows and says so', async (t) => {
		const { call } = await ownWorld(t, { rows: Array.from({ length: 205 }, (_, n) => row(USER_A, n)) });
		const { body } = await call('');
		assert.equal(body.rows.length, 200);
		assert.equal(body.truncated, true);
	});

	it('answers 503 self_data_unavailable when the store fails, not an empty list', async (t) => {
		const { call } = await ownWorld(t, { rows: [row(USER_A, 1)], failReads: (table) => table === TABLE });
		const response = await call('');
		assert.equal(response.status, 503);
		assert.equal(response.body.code, 'self_data_unavailable');
	});
});

describe('the health route', () => {
	const base = { sessionCutoffs: null, sessionRevocations: null, kv: null };

	it('carries the activity counts when the flag set the stats function', () => {
		const stats = { queued: 0, emitted: 3, dropped: { store: 1 }, defaultRows: 0, maintainFailures: 2 };
		assert.deepEqual(bridgeHealthState({ ...base, activityStats: () => stats }).activity, stats);
	});

	it('has no activity key when the flag is off', () => {
		assert.equal('activity' in bridgeHealthState(base), false);
	});
});

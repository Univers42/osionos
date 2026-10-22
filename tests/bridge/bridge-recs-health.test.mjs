/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-recs-health.test.mjs                        :+:      :+:    :+:   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * THE RECS HEALTH: the numbers of the "Recs health" admin chart (M3) — the
 * offline quality of every trained model over time, and the daily click-through
 * of the served recommendations.
 *
 * What the route must hold:
 *   - C91: the session's `isAdmin` claim is a hint. The DATABASE decides, on
 *     every call: a token without the claim never reaches the database, a token
 *     WITH the claim and a row that says false is refused, and a row that
 *     cannot be read is a 503 — never "allowed".
 *   - the window: an integer number of days in 1..180, a month by default. Any
 *     other value is a refusal, and the database is never asked.
 *   - the read: ONE call to the database's own function, with the window, and
 *     its answer is the answer.
 *   - a broken read is a 503 (`recs_health_unavailable`), never a half chart.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();

const ADMIN = 'adadadad-1111-4111-8111-adadadadadad';
const RPC = 'rpc/ai_rec_health';

/** The world's answer: a model, a champion, and a day of click-through. */
const HEALTH = {
	since: '2026-09-22T00:00:00.000Z',
	models: [
		{ id: 1, createdAt: '2026-10-01T00:00:00.000Z', status: 'retired', isSynthetic: true, eventsUsed: 120, ndcg10: 0.31, recall20: 0.22 },
		{ id: 2, createdAt: '2026-10-10T00:00:00.000Z', status: 'champion', isSynthetic: false, eventsUsed: 480, ndcg10: 0.42, recall20: 0.35 },
	],
	daily: [{ day: '2026-10-20', isSynthetic: false, impressions: 10, clicks: 3 }],
};

/** The administrator's row, and nothing else: the console and the chart read it. */
function world(extra = {}) {
	return {
		osionos_bridge_identities: [{ user_id: ADMIN, is_admin: true }],
		...extra,
	};
}

/** The mock, with the function of the database answering. */
function mockOf(seed = world(), options = {}) {
	return createPostgrestMock(seed, {
		rpc: { ai_rec_health: () => HEALTH },
		...options,
	});
}

/** The headers of an administrator: the token carries the claim. */
const adminHeaders = (userId = ADMIN) => sessionHeaders(config, userId, IDS.homeA, [], true);

/** The calls the bridge made to the database's function. */
const rpcCalls = (mock) => mock.calls.filter((call) => call.table === RPC);

describe('the recs health and the administrator claim (C91)', () => {
	it('a token WITHOUT the claim: 403, and not one call to the database', async () => {
		const mock = mockOf();
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/admin/recs/health', sessionHeaders(config, ADMIN, IDS.homeA));
			assert.deepEqual(mock.calls, [], 'the database was read for a token that claims nothing');
			assert.equal(answer.status, 403);
			assert.equal(answer.body.code, 'admin_required');
		});
	});

	it('no token at all: 401, and not one call to the database', async () => {
		const mock = mockOf();
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/admin/recs/health', {});
			assert.equal(answer.status, 401);
			assert.deepEqual(mock.calls, []);
		});
	});

	it('a token WITH the claim but a row that says false: 403, and the function is never called', async () => {
		const mock = mockOf(world({ osionos_bridge_identities: [{ user_id: ADMIN, is_admin: false }] }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/admin/recs/health', adminHeaders());
			assert.equal(answer.status, 403);
			assert.equal(answer.body.code, 'admin_required');
			assert.equal(rpcCalls(mock).length, 0);
		});
	});

	it('a row that cannot be read: 503, never "allowed"', async () => {
		const mock = mockOf(world(), {
			failWhen: (call) => (call.table === 'osionos_bridge_identities' ? { status: 500, body: { message: 'the database is down' } } : null),
		});
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/admin/recs/health', adminHeaders());
			assert.equal(answer.status, 503);
			assert.equal(answer.body.code, 'admin_check_failed');
			assert.equal(rpcCalls(mock).length, 0);
		});
	});
});

describe('the window', () => {
	it('days=0: 400, and the function is never called', async () => {
		const mock = mockOf();
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/admin/recs/health?days=0', adminHeaders());
			assert.equal(answer.status, 400);
			assert.equal(answer.body.code, 'invalid_days');
			assert.equal(rpcCalls(mock).length, 0);
		});
	});

	it('days=181: 400, and the function is never called', async () => {
		const mock = mockOf();
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/admin/recs/health?days=181', adminHeaders());
			assert.equal(answer.status, 400);
			assert.equal(answer.body.code, 'invalid_days');
			assert.equal(rpcCalls(mock).length, 0);
		});
	});

	it('days=abc: 400, and the function is never called', async () => {
		const mock = mockOf();
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/admin/recs/health?days=abc', adminHeaders());
			assert.equal(answer.status, 400);
			assert.equal(answer.body.code, 'invalid_days');
			assert.equal(rpcCalls(mock).length, 0);
		});
	});
});

describe('the numbers', () => {
	it('the answer of the database, read with a month', async () => {
		const mock = mockOf();
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/admin/recs/health', adminHeaders());
			assert.equal(answer.status, 200, answer.text);
			assert.deepEqual(answer.body, HEALTH);
			assert.equal(rpcCalls(mock).length, 1);
			assert.deepEqual(rpcCalls(mock)[0].body, { p_days: 30 });
			assert.equal(rpcCalls(mock)[0].method, 'POST');
		});
	});

	it('a window of seven days is the window the function is asked for', async () => {
		const mock = mockOf();
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/admin/recs/health?days=7', adminHeaders());
			assert.equal(answer.status, 200, answer.text);
			assert.equal(rpcCalls(mock).length, 1);
			assert.deepEqual(rpcCalls(mock)[0].body, { p_days: 7 });
		});
	});

	it('a function that fails: 503, never a half chart', async () => {
		const mock = mockOf(world(), {
			failWhen: (call) => (call.table === RPC ? { status: 500, body: { message: 'the function is broken' } } : null),
		});
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/admin/recs/health', adminHeaders());
			assert.equal(answer.status, 503);
			assert.equal(answer.body.code, 'recs_health_unavailable');
		});
	});

	it('another method: 405, and the function is never called', async () => {
		const mock = mockOf();
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/admin/recs/health', adminHeaders(), { method: 'POST', body: '{}' });
			assert.equal(answer.status, 405);
			assert.equal(answer.body.code, 'method_not_allowed');
			assert.equal(rpcCalls(mock).length, 0);
		});
	});
});

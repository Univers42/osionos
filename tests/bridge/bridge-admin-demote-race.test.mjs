// osionos#343, ruling Q3/D343-4: A demoting B while B demotes A passes both gates and both counts,
// and would leave no flagged admin. One global lock serialises the demotions, the caller's flag is
// re-read inside it, and the last-admin count is over distinct user ids, not identity rows.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { USER_A, USER_B } from './support/account-world.mjs';
import { sudoAdminToken } from './support/admin-route-world.mjs';
import { BAAS_FETCH_TIMEOUT_MS } from '../../scripts/bridge-baas-body.mjs';
import { IDENTITIES, demoteTables, flagged, startDemoteWorld } from './support/demote-world.mjs';

const flaggedUsers = (store) => new Set(store.rows(IDENTITIES).filter((row) => row.is_admin === true && row.user_id).map((row) => row.user_id));
const isCount = (url) => String(url).includes('/osionos_bridge_identities?') && String(url).includes('select=user_id') && !String(url).includes('or=');

/** Holds every GoTrue answer until `expected` reads are waiting: both runs are past the gate at once. */
function barrier(expected) {
	const waiting = [];
	return (next) => async (url, init) => {
		if (!String(url).includes('/auth/v1/')) return next(url, init);
		await new Promise((release) => {
			waiting.push(release);
			if (waiting.length === expected) waiting.forEach((go) => go());
		});
		return next(url, init);
	};
}

function answering(rows) {
	return (next) => async (url, init) => {
		if (!isCount(url)) return next(url, init);
		return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
	};
}

describe('two admins demoting each other at once', () => {
	it('exactly one wins, the other is refused, and a flagged admin remains', async (t) => {
		const world = await startDemoteWorld(t, { wrap: barrier(2) });
		const fromB = await sudoAdminToken(world.config, world.kv, USER_B);
		const answers = await Promise.all([world.demote(USER_B), world.demote(USER_A, fromB)]);
		const statuses = answers.map((answer) => answer.status).sort();
		assert.deepEqual(statuses, [200, 409], answers.map((answer) => answer.text).join(' | '));
		assert.equal(answers.find((answer) => answer.status === 409).body.code, 'demote_busy');
		assert.equal(flaggedUsers(world.store).size, 1, 'one flagged admin is left');
		assert.equal(world.kv.values.has('osb:admin-demote'), false);
	});

	it('the lock outlives the locked section even when every call in it runs to the fetch timeout', async (t) => {
		const world = await startDemoteWorld(t);
		const { setNx, del } = world.kv;
		const lock = { ttl: 0, from: 0, calls: 0 };
		world.kv.setNx = (key, value, ttlMs) => {
			if (key === 'admin-demote') Object.assign(lock, { ttl: ttlMs, from: world.store.calls.length });
			return setNx(key, value, ttlMs);
		};
		world.kv.del = (key) => {
			if (key === 'admin-demote') lock.calls = world.store.calls.length - lock.from;
			return del(key);
		};
		assert.equal((await world.demote(USER_B)).status, 200);
		assert.ok(lock.calls >= 10, `${lock.calls} calls under the lock`);
		assert.ok(lock.ttl >= lock.calls * BAAS_FETCH_TIMEOUT_MS, `TTL ${lock.ttl} ms under ${lock.calls} calls of ${BAAS_FETCH_TIMEOUT_MS} ms`);
	});

	it('the loser retrying after the winner is refused 403: its own flag is gone', async (t) => {
		const world = await startDemoteWorld(t);
		const fromB = await sudoAdminToken(world.config, world.kv, USER_B);
		assert.equal((await world.demote(USER_B)).status, 200);
		const retry = await world.demote(USER_A, fromB);
		assert.equal(retry.status, 403);
		assert.equal(retry.body.code, 'admin_required');
		assert.equal(flagged(world.store, USER_A).length, 1);
	});
});

describe('the last-admin count is over distinct user ids', () => {
	it('two flagged rows of the target are not two other admins: 409 last_admin, nothing written', async (t) => {
		const world = await startDemoteWorld(t, { wrap: answering([{ user_id: USER_B }, { user_id: USER_B.toUpperCase() }, { user_id: null }]) });
		const answer = await world.demote(USER_B);
		assert.equal(answer.status, 409, answer.text);
		assert.equal(answer.body.code, 'last_admin');
		assert.deepEqual(world.writes(), []);
		assert.equal(flagged(world.store, USER_B).length, 3);
	});

	it('a caller with two flagged rows counts once, and is enough', async (t) => {
		const tables = demoteTables();
		tables[IDENTITIES].push({ provider: 'github', subject: 'gh-caller', user_id: USER_A, is_admin: true });
		const world = await startDemoteWorld(t, { tables });
		assert.equal((await world.demote(USER_B)).status, 200);
		assert.deepEqual([...flaggedUsers(world.store)], [USER_A]);
	});

	it('the count read fails: 503, nothing written', async (t) => {
		const world = await startDemoteWorld(t, { wrap: (next) => async (url, init) => (isCount(url) ? new Response('{}', { status: 500 }) : next(url, init)) });
		const answer = await world.demote(USER_B);
		assert.equal(answer.status, 503);
		assert.deepEqual(world.writes(), []);
	});
});

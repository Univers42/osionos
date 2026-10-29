/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-activity.test.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ACTIVITY_EVENTS, ACTIVITY_SURFACES } from '../../scripts/bridge-activity-vocab.mjs';
import { createActivityEmitter } from '../../scripts/bridge-activity.mjs';
import { createActivityConsent } from '../../scripts/bridge-activity-consent.mjs';
import { startActivityMaintenance } from '../../scripts/bridge-activity-maintenance.mjs';

const ON = { OSIONOS_ACTIVITY: '1' };
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const session = (n) => ({ userId: uid(n) });
const yes = () => true;

function fakePg({ post = async () => null, get = async () => [], rpc = async () => [] } = {}) {
	const calls = { post: [], get: [], rpc: [] };
	const client = {
		post: (path, body, opts) => { calls.post.push({ path, body, opts }); return post(path, body, opts); },
		get: (path) => { calls.get.push(path); return get(path); },
		rpc: (fn, args) => { calls.rpc.push({ fn, args }); return rpc(fn, args); },
	};
	return { calls, asService: () => client };
}

const emitter = (pg, extra = {}) => createActivityEmitter({ pg, env: ON, isTracked: yes, ...extra });

describe('activity emitter', () => {
	it('emit is synchronous and returns before the store resolves', () => {
		let release;
		const pg = fakePg({ post: () => new Promise((resolve) => { release = resolve; }) });
		const e = emitter(pg, { env: { ...ON, ACTIVITY_BATCH_SIZE: '1' } });
		e.emit(session(1), 'login', 'settings', null);
		assert.equal(pg.calls.post.length, 1);
		assert.equal(e.stats().emitted, 0);
		release();
	});

	it('a flood from one user leaves another user intact and counts dropped.user_rate', () => {
		const e = emitter(fakePg(), { env: { ...ON, ACTIVITY_USER_PER_MIN: '5', ACTIVITY_BATCH_SIZE: '1000' } });
		for (let i = 0; i < 50; i += 1) e.emit(session(1), 'search', 'search', null);
		e.emit(session(2), 'search', 'search', null);
		assert.equal(e.stats().dropped.user_rate, 45);
		assert.equal(e.stats().queued, 6);
		return e.close({ deadlineMs: 50 });
	});

	it('the queue never exceeds the cap under 100,000 pushes', async () => {
		const e = emitter(fakePg({ post: () => new Promise(() => {}) }), { env: { ...ON, ACTIVITY_QUEUE_MAX: '100', ACTIVITY_USER_PER_MIN: '1000000', ACTIVITY_BATCH_SIZE: '1000000' } });
		for (let i = 0; i < 100_000; i += 1) e.emit(session(i % 500), 'search', 'search', null);
		assert.equal(e.stats().queued, 100);
		assert.equal(e.stats().dropped.overflow, 99_900);
	});

	it('default consent queues nothing and issues no POST even with the flag on', async () => {
		const pg = fakePg();
		const e = createActivityEmitter({ pg, env: ON });
		e.emit(session(1), 'login', 'settings', null);
		await e.flush();
		assert.equal(e.stats().queued, 0);
		assert.equal(e.stats().dropped.untracked, 1);
		assert.equal(pg.calls.post.length, 0);
	});

	it('close writes queued rows and reports the lost count', async () => {
		const pg = fakePg();
		const e = emitter(pg, { env: { ...ON, ACTIVITY_BATCH_SIZE: '2' } });
		for (let i = 1; i <= 5; i += 1) e.emit(session(i), 'export', 'settings', null);
		const result = await e.close({ deadlineMs: 2000 });
		assert.deepEqual(result, { flushed: 5, lost: 0 });
		assert.equal(pg.calls.post.flatMap((c) => c.body).length, 5);
	});

	it('close reports rows it could not write by the deadline', async () => {
		const e = emitter(fakePg({ post: () => new Promise(() => {}) }), { env: { ...ON, ACTIVITY_BATCH_SIZE: '2' } });
		for (let i = 1; i <= 5; i += 1) e.emit(session(i), 'export', 'settings', null);
		assert.deepEqual(await e.close({ deadlineMs: 20 }), { flushed: 0, lost: 5 });
	});

	it('flag unset: emit does nothing and counts nothing', async () => {
		const pg = fakePg();
		const e = createActivityEmitter({ pg, env: {}, isTracked: yes });
		e.emit(session(1), 'login', 'settings', null);
		e.emit(session(1), 'nope', 'settings', null);
		await e.flush();
		assert.deepEqual(e.stats().dropped, { invalid: 0, overflow: 0, user_rate: 0, store: 0, untracked: 0 });
		assert.equal(pg.calls.post.length, 0);
	});

	it('a failing store counts dropped.store, never rejects, backs off and recovers', async () => {
		let clock = 1_000_000;
		let fail = true;
		const pg = fakePg({ post: async () => { if (fail) throw new Error('down'); return null; } });
		const e = emitter(pg, { now: () => clock, env: { ...ON, ACTIVITY_BATCH_SIZE: '1', ACTIVITY_FLUSH_MS: '1000' } });
		e.emit(session(1), 'login', 'settings', null);
		await e.flush();
		assert.equal(e.stats().dropped.store, 1);
		assert.equal(e.stats().lastFlushOk, false);
		assert.equal(e.stats().backoffMs, 2000);
		e.emit(session(2), 'login', 'settings', null);
		await e.flush();
		assert.equal(pg.calls.post.length, 1, 'no attempt inside the backoff');
		clock += 2001;
		fail = false;
		await e.flush();
		assert.equal(e.stats().emitted, 1);
		assert.equal(e.stats().backoffMs, 0);
	});

	it('invalid event, surface, user or workspace counts dropped.invalid and writes nothing', async () => {
		const pg = fakePg();
		const e = emitter(pg);
		e.emit(session(1), 'drop table', 'settings', null);
		e.emit(session(1), 'login', 'nowhere', null);
		e.emit({ userId: 'x' }, 'login', 'settings', null);
		e.emit(session(1), 'login', 'settings', 'not-a-uuid');
		e.emit(undefined, 'login', 'settings', null);
		await e.flush();
		assert.equal(e.stats().dropped.invalid, 5);
		assert.equal(pg.calls.post.length, 0);
	});

	it('the batch holds only the allowed keys', async () => {
		const pg = fakePg();
		const e = emitter(pg);
		e.emit({ userId: uid(1), email: 'a@b.c', extra: 1 }, 'page_open', 'editor', uid(9));
		await e.flush();
		const [row] = pg.calls.post[0].body;
		assert.deepEqual(Object.keys(row).sort(), ['event', 'surface', 'ts', 'user_id', 'workspace_id']);
		assert.equal(pg.calls.post[0].path, 'osionos_activity_events');
		assert.deepEqual(pg.calls.post[0].opts, { prefer: 'return=minimal' });
	});

	it('flushes at the batch size and at the interval', async (t) => {
		t.mock.timers.enable({ apis: ['setInterval'] });
		const pg = fakePg();
		const e = emitter(pg, { env: { ...ON, ACTIVITY_BATCH_SIZE: '3', ACTIVITY_FLUSH_MS: '1000' } });
		for (let i = 1; i <= 3; i += 1) e.emit(session(i), 'search', 'search', null);
		assert.equal(pg.calls.post.length, 1);
		await e.flush();
		e.emit(session(4), 'search', 'search', null);
		assert.equal(pg.calls.post.length, 1);
		t.mock.timers.tick(1000);
		assert.equal(pg.calls.post.length, 2);
		await e.close({ deadlineMs: 50 });
	});
});

describe('activity consent cache', () => {
	const settings = (value) => async () => [{ value }];

	it('a miss answers false and schedules a fill; a hit answers the stored boolean', async () => {
		const pg = fakePg({ get: settings({ activity_tracking: true }) });
		const consent = createActivityConsent({ pg });
		assert.equal(consent.isTracked(session(1)), false);
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(consent.isTracked(session(1)), true);
		assert.match(pg.calls.get[0], /^osionos_user_settings\?user_id=eq\.[0-9a-f-]+1&section=eq\.preferences/);
		assert.equal(pg.calls.get.length, 1);
	});

	it('a non-true value reads as off', async () => {
		const consent = createActivityConsent({ pg: fakePg({ get: settings({ activity_tracking: 'yes' }) }) });
		consent.isTracked(session(1));
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(consent.isTracked(session(1)), false);
	});

	it('an error answers false and never throws', async () => {
		const consent = createActivityConsent({ pg: fakePg({ get: async () => { throw new Error('down'); } }) });
		assert.equal(consent.isTracked(session(1)), false);
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(consent.isTracked(session(1)), false);
	});

	it('an opt-out takes effect once the entry is older than the TTL', async () => {
		let clock = 0;
		let value = { activity_tracking: true };
		const consent = createActivityConsent({ pg: fakePg({ get: async () => [{ value }] }), ttlMs: 1000, now: () => clock });
		consent.isTracked(session(1));
		await new Promise((resolve) => setImmediate(resolve));
		value = {};
		clock = 600;
		assert.equal(consent.isTracked(session(1)), true);
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(consent.isTracked(session(1)), false);
	});

	it('is bounded and refuses a non-uuid user without a query', async () => {
		const pg = fakePg({ get: settings({ activity_tracking: true }) });
		const consent = createActivityConsent({ pg, maxEntries: 3 });
		for (let i = 1; i <= 10; i += 1) consent.isTracked(session(i));
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(consent.size(), 3);
		assert.equal(consent.isTracked({ userId: 'x/../y' }), false);
		assert.equal(pg.calls.get.length, 10);
	});
});

describe('activity maintenance', () => {
	const quiet = { warn() {} };
	const clock = (extra = {}) => ({ now: () => Date.UTC(2026, 9, 24, 12), random: () => 0, ...extra });

	it('flag unset: no timer and zero queries', async (t) => {
		t.mock.timers.enable({ apis: ['setTimeout'] });
		const pg = fakePg();
		const timer = startActivityMaintenance({ pg, env: {}, log: quiet });
		t.mock.timers.tick(7 * 3600 * 1000);
		await timer.runOnce();
		timer.stop();
		assert.deepEqual(pg.calls, { post: [], get: [], rpc: [] });
	});

	it('calls maintain, then rollup(yesterday) and rollup(day-2)', async () => {
		const pg = fakePg({ rpc: async (fn) => (fn === 'osionos_activity_maintain' ? [{ ok: true, default_rows: 0 }] : [{ status: 'ok', cells: 3 }]) });
		const timer = startActivityMaintenance({ pg, env: ON, log: quiet, clock: clock() });
		await timer.runOnce();
		timer.stop();
		assert.deepEqual(pg.calls.rpc, [
			{ fn: 'osionos_activity_maintain', args: {} },
			{ fn: 'osionos_activity_rollup', args: { for_day: '2026-10-23' } },
			{ fn: 'osionos_activity_rollup', args: { for_day: '2026-10-22' } },
		]);
		assert.equal(timer.stats().maintainFailures, 0);
	});

	it('counts ok=false, a thrown store and a gone partition, and survives them', async () => {
		const pg = fakePg({
			rpc: async (fn, args) => {
				if (fn === 'osionos_activity_maintain') return [{ ok: false, default_rows: 7 }];
				if (args.for_day === '2026-10-23') throw new Error('down');
				return [{ status: 'partition_gone', cells: 0 }];
			},
		});
		const timer = startActivityMaintenance({ pg, env: ON, log: quiet, clock: clock() });
		await timer.runOnce();
		timer.stop();
		assert.deepEqual(timer.stats(), { defaultRows: 7, maintainFailures: 3 });
	});

	it('does not count a busy rollup as a failure', async () => {
		const pg = fakePg({ rpc: async (fn) => (fn === 'osionos_activity_maintain' ? [{ ok: true, default_rows: 0 }] : [{ status: 'busy', cells: 0 }]) });
		const timer = startActivityMaintenance({ pg, env: ON, log: quiet, clock: clock() });
		await timer.runOnce();
		timer.stop();
		assert.equal(timer.stats().maintainFailures, 0);
	});

	it('runs after the jitter, then every 6 hours, and stops', async (t) => {
		t.mock.timers.enable({ apis: ['setTimeout'] });
		const pg = fakePg({ rpc: async () => [{ ok: true, status: 'ok', default_rows: 0 }] });
		const timer = startActivityMaintenance({ pg, env: ON, log: quiet, clock: { now: () => Date.UTC(2026, 9, 24), random: () => 0.5, setTimeout, clearTimeout } });
		t.mock.timers.tick(29_999);
		assert.equal(pg.calls.rpc.length, 0);
		t.mock.timers.tick(1);
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(pg.calls.rpc.length, 3);
		t.mock.timers.tick(6 * 3600 * 1000);
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(pg.calls.rpc.length, 6);
		timer.stop();
		t.mock.timers.tick(6 * 3600 * 1000);
		assert.equal(pg.calls.rpc.length, 6);
	});
});

describe('vocabulary against the SQL migration', () => {
	const sqlPath = process.env.OSIONOS_ACTIVITY_SQL;
	const list = (sql, column) => [...sql.match(new RegExp(`${column}\\s+TEXT\\s+NOT NULL CHECK \\(${column} IN \\(([^)]*)\\)\\)`))[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

	it('the CHECK lists equal the vocabulary module', { skip: sqlPath === undefined ? 'OSIONOS_ACTIVITY_SQL is not set' : false }, () => {
		assert.ok(existsSync(sqlPath), `OSIONOS_ACTIVITY_SQL points at a missing file: ${sqlPath}`);
		const sql = readFileSync(sqlPath, 'utf8');
		assert.deepEqual(list(sql, 'event'), [...ACTIVITY_EVENTS]);
		assert.deepEqual(list(sql, 'surface'), [...ACTIVITY_SURFACES]);
	});
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-session-cutoff-poller.test.mjs              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The poller behind session revocation: a full keyset-paged reload every 10 s, swapped in whole, fail-closed
// when it cannot load. Each rule from the devil's ruling (P1, P2, P4-P7, P10, P11) has a test that fails
// when the rule is removed.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SessionCutoffs, STALE_AFTER_MS, loadAllCutoffs, startSessionCutoffPoller } from '../../scripts/bridge-session-cutoff.mjs';
import { createCutoffSource, cutoffResponse, cutoffRow, uuidAt } from './support/cutoff-source.mjs';

const T = Date.parse('2026-10-19T12:00:00.000Z');
const FIRST_LOAD_MICROS = Date.parse('2026-10-19T12:00:00Z') * 1000;
const flush = () => new Promise((done) => setImmediate(done));

function recorder() {
	const lines = { info: [], warn: [] };
	return { lines, log: { info: (line) => lines.info.push(line), warn: (line) => lines.warn.push(line) } };
}

function harness(rows = [], { maxRows, clock = { at: T }, pollOptions, answer } = {}) {
	const source = createCutoffSource(rows, { maxRows });
	if (answer) source.respondWith(answer);
	const { lines, log } = recorder();
	const tracker = new SessionCutoffs({ enforced: true, now: () => clock.at, log });
	const connection = { fetchImpl: source.fetchImpl, baasUrl: 'http://baas.local', serviceKey: 'service-key' };
	const poller = startSessionCutoffPoller(tracker, connection, { intervalMs: 3_600_000, ...pollOptions });
	return { source, tracker, lines, poller, clock, connection };
}

describe('P1: a full read every tick, keyset paged on user_id', () => {
	it('walks 1,200 rows in three pages with a user_id cursor and no filter on the timestamp', async () => {
		const rows = Array.from({ length: 1200 }, (_, index) => cutoffRow(index + 1));
		const { source, tracker, poller } = harness(rows);
		await flush();
		poller.stop();
		assert.equal(tracker.cutoffs.size, 1200);
		assert.deepEqual(source.calls.map((call) => call.params.get('user_id')), [null, `gt.${uuidAt(500)}`, `gt.${uuidAt(1000)}`]);
		for (const call of source.calls) {
			assert.equal(call.params.get('select'), 'user_id,sessions_valid_after');
			assert.equal(call.params.get('order'), 'user_id.asc');
			assert.equal(call.params.get('limit'), '500');
			assert.equal(call.params.has('sessions_valid_after'), false);
			assert.doesNotMatch(new URL(call.url).search, /\+/);
		}
	});

	it('swaps in a new Map at the end of the tick and leaves the old one untouched while it runs', async () => {
		const { source, tracker, poller } = harness([cutoffRow(1)]);
		await flush();
		const before = tracker.cutoffs;
		source.rows.push(cutoffRow(2));
		const release = source.hold();
		const running = poller.tick();
		await flush();
		assert.equal(tracker.cutoffs, before);
		assert.equal(before.size, 1);
		release();
		await running;
		poller.stop();
		assert.notEqual(tracker.cutoffs, before);
		assert.equal(tracker.cutoffs.size, 2);
	});

	it('forgets a row deleted between two polls', async () => {
		const { source, tracker, poller } = harness([cutoffRow(1), cutoffRow(2)]);
		await flush();
		assert.equal(tracker.cutoffs.has(uuidAt(2)), true);
		source.rows.pop();
		await poller.tick();
		poller.stop();
		assert.deepEqual([...tracker.cutoffs.keys()], [uuidAt(1)]);
	});

	it('follows a cut-off that moved backward, which a timestamp cursor would never see', async () => {
		const { source, tracker, poller } = harness([cutoffRow(1, '2026-10-19T12:00:00+00:00')]);
		await flush();
		source.rows[0].sessions_valid_after = '2026-01-01T00:00:00+00:00';
		await poller.tick();
		poller.stop();
		assert.equal(tracker.cutoffMicros(uuidAt(1)), Date.parse('2026-01-01T00:00:00Z') * 1000);
	});

	it('keeps the microseconds of each cut-off and lower-cases the user id', async () => {
		const { tracker, poller } = harness([{ user_id: uuidAt(1).toUpperCase(), sessions_valid_after: '2026-10-19T12:00:00.123456+00:00' }]);
		await flush();
		poller.stop();
		assert.equal(tracker.cutoffMicros(uuidAt(1)), FIRST_LOAD_MICROS + 123_456);
	});
});

describe('P2: a truncated read is a failed tick', () => {
	it('asks for count=exact on the first page only', async () => {
		const { source, poller } = harness(Array.from({ length: 600 }, (_, index) => cutoffRow(index + 1)));
		await flush();
		poller.stop();
		assert.deepEqual(source.calls.map((call) => call.prefer), ['count=exact', undefined]);
	});

	it('swaps nothing when PostgREST max-rows cut the answer short of the Content-Range total', async () => {
		const { tracker, lines, poller } = harness(Array.from({ length: 1200 }, (_, index) => cutoffRow(index + 1)), { maxRows: 300 });
		await flush();
		poller.stop();
		assert.equal(tracker.cutoffs, null);
		assert.equal(tracker.status(), 'loading');
		assert.match(lines.warn.join('\n'), /received 300 rows but Content-Range counted 1200/);
	});

	it('keeps the previous Map when a later tick is truncated', async () => {
		const { source, tracker, poller } = harness([cutoffRow(1)]);
		await flush();
		const loaded = tracker.cutoffs;
		source.respondWith(() => cutoffResponse([cutoffRow(1)], { 'content-range': '0-0/5' }));
		await poller.tick();
		poller.stop();
		assert.equal(tracker.cutoffs, loaded);
	});

	it('fails when the answer carries no Content-Range total', async () => {
		await assert.rejects(
			loadAllCutoffs({ fetchImpl: async () => cutoffResponse([]), baasUrl: 'http://baas.local', serviceKey: 'k' }, 1000),
			/Content-Range carried no total/,
		);
	});
});

describe('P4 and P5: boot and stale states', () => {
	it('is loading until the first load, fresh after it, and stale only past 60 s', async () => {
		const { tracker, poller, clock } = harness([cutoffRow(1)]);
		assert.equal(tracker.status(), 'loading');
		assert.equal(tracker.ageMs(), null);
		await flush();
		poller.stop();
		assert.equal(tracker.status(), 'fresh');
		clock.at = T + STALE_AFTER_MS;
		assert.equal(tracker.status(), 'fresh');
		clock.at = T + STALE_AFTER_MS + 1;
		assert.equal(tracker.status(), 'stale');
		assert.equal(tracker.ageMs(), STALE_AFTER_MS + 1);
	});

	it('logs each state change once, however many times it is asked', async () => {
		const { tracker, lines, poller, clock } = harness([cutoffRow(1)]);
		await flush();
		poller.stop();
		clock.at = T + STALE_AFTER_MS + 1;
		for (let asked = 0; asked < 50; asked += 1) tracker.status();
		assert.deepEqual([lines.info.length, lines.warn.length], [1, 1]);
		assert.match(lines.warn[0], /stale/);
	});

	it('goes fresh again after a load that follows a stale spell, with one more line', async () => {
		const { tracker, lines, poller, clock } = harness([cutoffRow(1)]);
		await flush();
		clock.at = T + STALE_AFTER_MS + 1;
		tracker.status();
		await poller.tick();
		poller.stop();
		assert.equal(tracker.status(), 'fresh');
		assert.deepEqual([lines.info.length, lines.warn.length], [2, 1]);
	});

	it('is off, and says why, when enforcement is not on', () => {
		const off = new SessionCutoffs({ enforced: false, offReason: 'OSIONOS_SESSION_CUTOFFS=off' });
		assert.equal(off.status(), 'off');
		assert.match(off.bootLine(), /OFF \(OSIONOS_SESSION_CUTOFFS=off\)/);
		const never = async () => { throw new Error('an off tracker must not fetch'); };
		startSessionCutoffPoller(off, { fetchImpl: never, baasUrl: 'http://baas.local', serviceKey: 'k' }).stop();
	});
});

describe('P6: every kind of failed tick names the table and the fix', () => {
	const failures = {
		'a missing table (404 42P01)': () => new Response(JSON.stringify({ code: '42P01', message: 'relation "public.auth_session_cutoffs" does not exist' }), { status: 404 }),
		'a 500': () => new Response('boom', { status: 500 }),
		'a 401': () => new Response('{"code":"42501"}', { status: 401 }),
		'a body that is not JSON': () => new Response('<html>', { status: 200, headers: { 'content-range': '*/0' } }),
		'a body that is not a list': () => new Response('{}', { status: 200, headers: { 'content-range': '*/0' } }),
		'a row with a bad timestamp': () => cutoffResponse([{ user_id: uuidAt(1), sessions_valid_after: 'soon' }], { 'content-range': '0-0/1' }),
		'a row with a bad user id': () => cutoffResponse([{ user_id: 'nobody', sessions_valid_after: '2026-10-19T12:00:00Z' }], { 'content-range': '0-0/1' }),
	};
	for (const [name, answer] of Object.entries(failures)) {
		it(`fails the tick on ${name}, swaps nothing`, async () => {
			const { tracker, lines, poller } = harness([], { answer });
			await flush();
			poller.stop();
			assert.equal(tracker.cutoffs, null);
			assert.equal(tracker.status(), 'loading');
			assert.match(lines.warn[0], /public\.auth_session_cutoffs/);
			assert.match(lines.warn[0], /apply models\/auth-session-cutoffs\.sql/);
		});
	}

	it('fails the tick on a timeout and names the table', async () => {
		const { tracker, lines, poller } = harness([], { pollOptions: { timeoutMs: 20 }, answer: () => new Promise(() => {}) });
		await new Promise((done) => setTimeout(done, 80));
		poller.stop();
		assert.equal(tracker.cutoffs, null);
		assert.match(lines.warn.join('\n'), /timed out after 20 ms.*public\.auth_session_cutoffs/);
	});

	it('logs a repeated identical failure once, not every tick', async () => {
		const { lines, poller } = harness([], { answer: () => new Response('boom', { status: 500 }) });
		await flush();
		await poller.tick();
		await poller.tick();
		poller.stop();
		assert.equal(lines.warn.filter((line) => /load failed/.test(line)).length, 1);
	});
});

describe('P7: scheduling', () => {
	it('chains setTimeout every 10 s, never setInterval, and does not overlap ticks', async (t) => {
		t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
		const intervalSpy = t.mock.method(globalThis, 'setInterval');
		const source = createCutoffSource([cutoffRow(1)]);
		const tracker = new SessionCutoffs({ enforced: true, now: () => T, log: recorder().log });
		const poller = startSessionCutoffPoller(tracker, { fetchImpl: source.fetchImpl, baasUrl: 'http://baas.local', serviceKey: 'k' });
		await flush();
		assert.equal(source.calls.length, 1);
		t.mock.timers.tick(9_999);
		await flush();
		assert.equal(source.calls.length, 1);
		const release = source.hold();
		t.mock.timers.tick(1);
		await flush();
		assert.equal(source.calls.length, 2);
		t.mock.timers.tick(30_000);
		await flush();
		assert.equal(source.calls.length, 2, 'a tick in flight schedules nothing');
		release();
		await flush();
		t.mock.timers.tick(10_000);
		await flush();
		assert.equal(source.calls.length, 3);
		poller.stop();
		t.mock.timers.tick(60_000);
		await flush();
		assert.equal(source.calls.length, 3, 'stop() ends the chain');
		assert.equal(intervalSpy.mock.callCount(), 0);
	});

	it('raises no unhandledRejection across a rejecting fetch, a throwing JSON parse and a timeout', async () => {
		const seen = [];
		const onRejection = (reason) => seen.push(reason);
		process.on('unhandledRejection', onRejection);
		try {
			const answers = [
				() => Promise.reject(new Error('socket hang up')),
				() => ({ ok: true, headers: new Headers(), text: async () => '{not json' }),
				() => new Promise(() => {}),
			];
			for (const answer of answers) {
				const { poller } = harness([], { pollOptions: { timeoutMs: 20 }, answer });
				await new Promise((done) => setTimeout(done, 60));
				poller.stop();
			}
			await flush();
			await flush();
		} finally {
			process.off('unhandledRejection', onRejection);
		}
		assert.equal(seen.length, 0);
	});
});

describe('P10: a write this process made survives an older poll', () => {
	it('applies at once as max(existing, written)', async () => {
		const { tracker, poller } = harness([cutoffRow(1, '2026-10-19T12:00:00+00:00')]);
		await flush();
		poller.stop();
		tracker.applyLocal(uuidAt(1), FIRST_LOAD_MICROS - 5_000_000);
		assert.equal(tracker.cutoffMicros(uuidAt(1)), FIRST_LOAD_MICROS);
		tracker.applyLocal(uuidAt(1), FIRST_LOAD_MICROS + 5_000_000);
		tracker.applyLocal(uuidAt(2), FIRST_LOAD_MICROS + 1);
		assert.deepEqual([uuidAt(1), uuidAt(2)].map((id) => tracker.cutoffMicros(id)), [FIRST_LOAD_MICROS + 5_000_000, FIRST_LOAD_MICROS + 1]);
	});

	it('keeps the local value when a poll that started before the write delivers its older answer', async () => {
		const { source, tracker, poller } = harness([cutoffRow(1)]);
		await flush();
		const release = source.hold();
		const inFlight = poller.tick();
		await flush();
		tracker.applyLocal(uuidAt(2), FIRST_LOAD_MICROS + 9_000_000);
		release();
		await inFlight;
		assert.equal(tracker.cutoffMicros(uuidAt(2)), FIRST_LOAD_MICROS + 9_000_000);
		assert.equal(tracker.cutoffMicros(uuidAt(1)), FIRST_LOAD_MICROS);
		await poller.tick();
		poller.stop();
		assert.equal(tracker.cutoffMicros(uuidAt(2)), undefined, 'the next poll starts after the write, so the table is the truth again');
	});

	it('also holds for a write that lands before the very first load completes', async () => {
		const { source, tracker, poller } = harness([]);
		const release = source.hold();
		await flush();
		tracker.applyLocal(uuidAt(3), FIRST_LOAD_MICROS + 1);
		release();
		await flush();
		poller.stop();
		assert.equal(tracker.cutoffMicros(uuidAt(3)), FIRST_LOAD_MICROS + 1);
	});
});

describe('P11: table size', () => {
	it('warns once when the table passes 5,000 rows, however many ticks follow', async () => {
		const { lines, poller } = harness(Array.from({ length: 5001 }, (_, index) => cutoffRow(index + 1)));
		await flush();
		await poller.tick();
		await poller.tick();
		poller.stop();
		assert.equal(lines.warn.filter((line) => /5001 rows/.test(line)).length, 1);
	});

	it('does not warn at 5,000 rows', async () => {
		const { lines, poller } = harness(Array.from({ length: 5000 }, (_, index) => cutoffRow(index + 1)));
		await flush();
		poller.stop();
		assert.deepEqual(lines.warn, []);
	});

	it('carries the cost and the reopen point in the file header Caveat', () => {
		const header = readFileSync(new URL('../../scripts/bridge-session-cutoff.mjs', import.meta.url), 'utf8').slice(0, 3000);
		assert.match(header, /Caveat: a full reload costs about 112 B\/row every 10 s \(1k rows = 112 KB, measured/);
		assert.match(header, /delta poll on a DB-assigned updated_at with a lookback/);
	});
});

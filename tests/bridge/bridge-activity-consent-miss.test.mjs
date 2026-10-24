/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-activity-consent-miss.test.mjs              +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What the emitter does on a consent-cache miss and when the store fails: the event waits
 * for the fill instead of being dropped, fills are capped, and a failing flush leaves one
 * numbers-only line per streak.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createActivityEmitter } from '../../scripts/bridge-activity.mjs';
import { createActivityConsent } from '../../scripts/bridge-activity-consent.mjs';

const ON = { OSIONOS_ACTIVITY: '1' };
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const session = (n) => ({ userId: uid(n) });
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fakePg({ post = async () => null, get = async () => [] } = {}) {
	const calls = { post: [], get: [] };
	const client = {
		post: (path, body) => { calls.post.push(body); return post(path, body); },
		get: (path) => { calls.get.push(path); return get(path); },
	};
	return { calls, asService: () => client };
}

function wired(pg, extra = {}) {
	const consent = createActivityConsent({ pg });
	const emitter = createActivityEmitter({ pg, env: ON, isTracked: consent.isTracked, awaitTracked: consent.awaitTracked, ...extra });
	return { consent, emitter };
}

describe('a consent miss waits for the fill', () => {
	it('records the first event of an opted-in user whose entry is absent or expired', async () => {
		const pg = fakePg({ get: async () => [{ value: { activity_tracking: true } }] });
		const { emitter } = wired(pg);
		emitter.emit(session(1), 'login', 'settings', null);
		assert.equal(emitter.stats().queued, 0, 'emit returned before the fill resolved');
		await tick();
		assert.equal(emitter.stats().queued, 1);
		await emitter.close({ deadlineMs: 100 });
		assert.equal(pg.calls.post[0].length, 1);
		assert.equal(pg.calls.post[0][0].event, 'login');
	});

	for (const [name, get] of [
		['opted out', async () => [{ value: { activity_tracking: false } }]],
		['no preference row', async () => []],
		['a non-true value', async () => [{ value: { activity_tracking: 'yes' } }]],
		['a store error', async () => { throw new Error('down'); }],
	]) {
		it(`records nothing for ${name}`, async () => {
			const pg = fakePg({ get });
			const { emitter } = wired(pg);
			emitter.emit(session(1), 'login', 'settings', null);
			await tick();
			assert.equal(emitter.stats().queued, 0);
			assert.equal(emitter.stats().dropped.untracked, 1);
		});
	}

	it('keeps the time of the action, not the time the fill resolved', async () => {
		let clock = 1_000;
		let release;
		const pg = fakePg({ get: () => new Promise((resolve) => { release = () => resolve([{ value: { activity_tracking: true } }]); }) });
		const { emitter } = wired(pg, { now: () => clock });
		emitter.emit(session(1), 'login', 'settings', null);
		clock = 5_000;
		release();
		await tick();
		await emitter.close({ deadlineMs: 100 });
		assert.equal(pg.calls.post[0][0].ts, new Date(1_000).toISOString());
	});
});

describe('consent fills are capped', () => {
	it('never has more than 20 reads in flight over 1,000 distinct users, and counts the refused ones', async () => {
		let running = 0;
		let peak = 0;
		const pg = fakePg({
			get: async () => {
				running += 1;
				peak = Math.max(peak, running);
				await tick();
				running -= 1;
				return [{ value: { activity_tracking: true } }];
			},
		});
		const { consent, emitter } = wired(pg);
		for (let i = 1; i <= 1000; i += 1) emitter.emit(session(i), 'search', 'search', null);
		await tick();
		await tick();
		assert.ok(peak <= 20, `peak ${peak}`);
		assert.equal(pg.calls.get.length, 20, 'a miss without a free slot issues no query');
		assert.equal(consent.stats().droppedFillCap, 980);
		assert.equal(emitter.stats().dropped.untracked, 980);
	});

	it('frees the slot when a fill fails', async () => {
		const pg = fakePg({ get: async () => { throw new Error('down'); } });
		const { consent } = wired(pg);
		for (let i = 1; i <= 20; i += 1) consent.isTracked(session(i));
		await tick();
		consent.isTracked(session(21));
		assert.equal(pg.calls.get.length, 21);
	});
});

describe('a failing flush leaves one line per streak', () => {
	it('logs the first failure and the recovery, with counts and no ids', async () => {
		let healthy = false;
		const lines = [];
		const pg = fakePg({ post: async () => { if (!healthy) throw new Error('boom user@example.com'); } });
		const emitter = createActivityEmitter({ pg, env: ON, isTracked: () => true, log: (line) => lines.push(line) });
		for (let round = 0; round < 3; round += 1) {
			emitter.emit(session(1), 'login', 'settings', null);
			await emitter.flush({ force: true });
		}
		assert.equal(lines.length, 1, 'one line for the whole streak');
		healthy = true;
		emitter.emit(session(1), 'login', 'settings', null);
		await emitter.flush({ force: true });
		assert.equal(lines.length, 2);
		for (const line of lines) {
			assert.match(line, /\d/);
			assert.equal(/@|0000/.test(line), false, line);
		}
	});
});

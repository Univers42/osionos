/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-kv.test.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The in-process half of the shared store: TTLs, single-use keys, counters and the
// bounded maps that keep a counter flood away from a replay marker.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createKv } from '../../scripts/bridge-kv.mjs';

// The clock is mocked: a real 20 ms TTL raced a loaded CI runner, which took longer than
// that between the set and the next line's read (develop CI 40468680294).
const mockClock = (t) => t.mock.timers.enable({ apis: ['Date', 'setInterval'] });

describe('createKv memory backend', () => {
	it('expires a value after its ttl and deletes it on demand', async (t) => {
		mockClock(t);
		const kv = createKv({ memory: { sweepMs: 5 } });
		await kv.set('short', 'value', 20);
		assert.equal(await kv.get('short'), 'value');
		t.mock.timers.tick(19);
		assert.equal(await kv.get('short'), 'value');
		t.mock.timers.tick(1);
		assert.equal(await kv.get('short'), null);
		await kv.set('gone', 'value', 1_000);
		await kv.del('gone');
		assert.equal(await kv.get('gone'), null);
		kv.close();
	});

	it('lets exactly one concurrent setNx win and consumes getDel once', async () => {
		const kv = createKv({});
		const [first, second] = await Promise.all([kv.setNx('race', 'a', 1_000), kv.setNx('race', 'b', 1_000)]);
		assert.deepEqual([first, second].filter(Boolean).length, 1);
		assert.equal(await kv.setNx('race', 'c', 1_000), false);
		assert.equal(await kv.getDel('race'), first ? 'a' : 'b');
		assert.equal(await kv.getDel('race'), null);
		kv.close();
	});

	it('counts in a fixed window and restarts after it expires', async (t) => {
		mockClock(t);
		const kv = createKv({});
		assert.deepEqual([await kv.incrWithTtl('hits', 30), await kv.incrWithTtl('hits', 30)], [1, 2]);
		t.mock.timers.tick(29);
		assert.equal(await kv.incrWithTtl('hits', 30), 3);
		t.mock.timers.tick(1);
		assert.equal(await kv.incrWithTtl('hits', 30), 1);
		kv.close();
	});

	it('keeps a counter flood from evicting a live single-use key', async () => {
		const kv = createKv({ memory: { maxEntries: 4 } });
		await kv.set('replay', 'marker', 60_000);
		for (let index = 0; index < 40; index += 1) await kv.incrWithTtl(`flood:${index}`, 60_000);
		assert.equal(await kv.getDel('replay'), 'marker');
		kv.close();
	});

	it('refuses an empty key, a non-string value and a bad ttl', async () => {
		const kv = createKv({});
		assert.throws(() => kv.get(''), TypeError);
		assert.throws(() => kv.set('k', 1, 1_000), TypeError);
		assert.throws(() => kv.set('k', 'v', 0), TypeError);
		assert.throws(() => kv.set('k', 'v', 1.5), TypeError);
		assert.throws(() => kv.setNx('k', 'v', -1), TypeError);
		assert.throws(() => kv.incrWithTtl('k', 'soon'), TypeError);
		kv.close();
	});

	it('is the backend without a redis and resolves ready at once', async () => {
		const kv = createKv({});
		assert.equal(kv.backend(), 'memory');
		await kv.ready({ timeoutMs: 50 });
		assert.equal(kv.pendingReadyWaiters(), 0);
		kv.close();
	});
});

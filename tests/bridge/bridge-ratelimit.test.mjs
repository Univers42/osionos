/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-ratelimit.test.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { takeToken } from '../../scripts/bridge-ratelimit.mjs';

// The bucket Map is module-level, so every test uses a UNIQUE key to stay isolated.
describe('takeToken', () => {
	it('allows up to capacity then throws 429', () => {
		const key = 'test:burst';
		for (let i = 0; i < 3; i += 1) takeToken(key, { capacity: 3, refillPerSec: 1, now: 1000 });
		assert.throws(
			() => takeToken(key, { capacity: 3, refillPerSec: 1, now: 1000 }),
			(err) => err.status === 429 && /too many/i.test(err.message),
		);
	});

	it('refills over time at refillPerSec', () => {
		const key = 'test:refill';
		for (let i = 0; i < 2; i += 1) takeToken(key, { capacity: 2, refillPerSec: 1, now: 5000 });
		assert.throws(() => takeToken(key, { capacity: 2, refillPerSec: 1, now: 5000 }), (e) => e.status === 429);
		// 2s later → 2 tokens back; two takes succeed, the third 429s again.
		takeToken(key, { capacity: 2, refillPerSec: 1, now: 7000 });
		takeToken(key, { capacity: 2, refillPerSec: 1, now: 7000 });
		assert.throws(() => takeToken(key, { capacity: 2, refillPerSec: 1, now: 7000 }), (e) => e.status === 429);
	});

	it('never refills above capacity', () => {
		const key = 'test:cap';
		takeToken(key, { capacity: 2, refillPerSec: 100, now: 0 });
		// A huge idle gap would over-refill without the Math.min clamp.
		for (let i = 0; i < 2; i += 1) takeToken(key, { capacity: 2, refillPerSec: 100, now: 1_000_000 });
		assert.throws(() => takeToken(key, { capacity: 2, refillPerSec: 100, now: 1_000_000 }), (e) => e.status === 429);
	});

	it('keeps independent buckets per key', () => {
		takeToken('test:a', { capacity: 1, refillPerSec: 1, now: 0 });
		// A different key is unaffected by 'test:a' being drained.
		assert.doesNotThrow(() => takeToken('test:b', { capacity: 1, refillPerSec: 1, now: 0 }));
	});

	it('puts the wait in seconds on the 429 so a route can send Retry-After', () => {
		const key = 'test:retry-after';
		takeToken(key, { capacity: 1, refillPerSec: 0.01, now: 0 });
		assert.throws(() => takeToken(key, { capacity: 1, refillPerSec: 0.01, now: 0 }), (e) => e.status === 429 && e.retryAfterSec === 100);
	});

	it('a bucket with retainMs survives the idle prune that resets a default one', () => {
		const hourly = { capacity: 1, refillPerSec: 1 / 3600, retainMs: 3_600_000 };
		const plain = { capacity: 1, refillPerSec: 1 / 3600 };
		takeToken('test:retain', { ...hourly, now: 0 });
		takeToken('test:no-retain', { ...plain, now: 0 });
		// 500+ other operations trigger the prune sweep ten minutes later: past the 5-minute default idle limit.
		for (let i = 0; i < 600; i += 1) takeToken(`test:noise:${i}`, { capacity: 1, refillPerSec: 1, now: 600_000 });
		assert.throws(() => takeToken('test:retain', { ...hourly, now: 600_000 }), (e) => e.status === 429);
		assert.doesNotThrow(() => takeToken('test:no-retain', { ...plain, now: 600_000 }), 'the default bucket was pruned and starts full again');
	});
});

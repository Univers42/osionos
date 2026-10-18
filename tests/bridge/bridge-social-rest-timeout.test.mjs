/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-social-rest-timeout.test.mjs                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The social bridge's rest() shares the main bridge's 8 s BaaS budget (a cold Funnel hop
// measured 3.7 s). AbortSignal.timeout runs on a native timer that mock timers cannot
// advance, so the test swaps it for one driven by the mocked setTimeout; it still asserts
// the exact budget the code asks for.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BAAS_FETCH_TIMEOUT_MS } from '../../scripts/bridge-baas-body.mjs';
import { rest } from '../../scripts/bridge-social-core.mjs';

const config = { baasUrl: 'http://baas.test', serviceKey: 'svc' };

function mockClock(t) {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const budgets = [];
	t.mock.method(AbortSignal, 'timeout', (ms) => {
		budgets.push(ms);
		const controller = new AbortController();
		setTimeout(() => controller.abort(new Error('timed out')), ms);
		return controller.signal;
	});
	return budgets;
}

function answerAfter(ms, rows) {
	return (_url, init) => new Promise((resolve, reject) => {
		init.signal.addEventListener('abort', () => reject(new Error('This operation was aborted')));
		setTimeout(() => resolve({ ok: true, status: 200, text: async () => JSON.stringify(rows) }), ms);
	});
}

async function advance(t, seconds) {
	for (let i = 0; i < seconds; i += 1) { await Promise.resolve(); t.mock.timers.tick(1_000); await new Promise((r) => setImmediate(r)); }
}

describe('social rest() BaaS budget', () => {
	it('is the one 8 s constant bridge-api.mjs uses', () => {
		assert.equal(BAAS_FETCH_TIMEOUT_MS, 8_000);
		assert.match(readFileSync(new URL('../../scripts/bridge-api.mjs', import.meta.url), 'utf8'), /BAAS_FETCH_TIMEOUT_MS[^=]*from '\.\/bridge-baas-body\.mjs'/);
		assert.doesNotMatch(readFileSync(new URL('../../scripts/bridge-social-core.mjs', import.meta.url), 'utf8'), /from '\.\/bridge-api\.mjs'/);
	});

	it('lets a cold call slower than the old 2.5 s budget finish', async (t) => {
		const budgets = mockClock(t);
		const pending = rest(config, answerAfter(3_700, [{ id: 1 }]), 'osionos_connections');
		await advance(t, 5);
		assert.deepEqual(await pending, [{ id: 1 }]);
		assert.deepEqual(budgets, [8_000]);
	});

	it('aborts a call slower than 8 s', async (t) => {
		mockClock(t);
		const pending = rest(config, answerAfter(8_100, []), 'osionos_connections');
		const outcome = pending.then(() => 'resolved', (error) => error.message);
		await advance(t, 9);
		assert.equal(await outcome, 'This operation was aborted');
	});
});

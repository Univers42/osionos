/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-ytext-preflight.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * COLLAB_YTEXT=1 boot gate: the bridge refuses to start unless one service-role read
 * of `osionos_pages.version` answers — and no refusal names the host or the key.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { checkYtextPreconditions } from '../../scripts/bridge-ytext-preflight.mjs';

const CONFIG = { baasUrl: 'https://secret-host.example', serviceKey: 'sk-test-SECRET' };

function fakeFetch(behaviour) {
	const calls = [];
	const fn = async (url, init) => {
		calls.push({ url, init });
		return behaviour(url, init);
	};
	fn.calls = calls;
	return fn;
}

describe('Y.Text preflight', () => {
	it('a. answers { checked: false } and makes no fetch call when COLLAB_YTEXT is unset', async () => {
		const fn = fakeFetch(() => ({ ok: true, status: 200 }));
		const result = await checkYtextPreconditions({ env: {}, config: CONFIG, fetchImpl: fn });
		assert.deepEqual(result, { checked: false });
		assert.equal(fn.calls.length, 0);
	});

	it('b. probes osionos_pages.version once with the service key when COLLAB_YTEXT=1', async () => {
		const fn = fakeFetch(() => ({ ok: true, status: 200 }));
		const result = await checkYtextPreconditions({ env: { COLLAB_YTEXT: '1' }, config: CONFIG, fetchImpl: fn });
		assert.deepEqual(result, { checked: true });
		assert.equal(fn.calls.length, 1);
		assert.ok(fn.calls[0].url.endsWith('/rest/v1/osionos_pages?select=version&limit=0'));
		assert.equal(fn.calls[0].init.headers.apikey, CONFIG.serviceKey);
		assert.equal(fn.calls[0].init.headers.Authorization, `Bearer ${CONFIG.serviceKey}`);
		assert.ok(fn.calls[0].init.signal instanceof AbortSignal);
	});

	it('c. refuses with the HTTP status when the probe answers 400', async () => {
		const fn = fakeFetch(() => ({ ok: false, status: 400 }));
		const p = checkYtextPreconditions({ env: { COLLAB_YTEXT: '1' }, config: CONFIG, fetchImpl: fn });
		await assert.rejects(p, (err) => {
			assert.match(err.message, /HTTP 400/);
			assert.match(err.message, /osionos_pages\.version/);
			return true;
		});
	});

	it('d. refuses with TimeoutError when the probe throws a TimeoutError DOMException', async () => {
		const fn = fakeFetch(() => { throw new DOMException('t', 'TimeoutError'); });
		const p = checkYtextPreconditions({ env: { COLLAB_YTEXT: '1' }, config: CONFIG, fetchImpl: fn });
		await assert.rejects(p, (err) => {
			assert.match(err.message, /TimeoutError/);
			return true;
		});
	});

	it('e. refuses with TypeError when the probe throws a network TypeError', async () => {
		const fn = fakeFetch(() => { throw new TypeError('fetch failed'); });
		const p = checkYtextPreconditions({ env: { COLLAB_YTEXT: '1' }, config: CONFIG, fetchImpl: fn });
		await assert.rejects(p, (err) => {
			assert.match(err.message, /TypeError/);
			return true;
		});
	});

	it('f. no refusal message carries the BaaS host or the service key', async () => {
		const failures = [
			() => ({ ok: false, status: 400 }),
			() => { throw new DOMException('t', 'TimeoutError'); },
			() => { throw new TypeError('fetch failed'); },
		];
		for (const behaviour of failures) {
			const fn = fakeFetch(behaviour);
			const p = checkYtextPreconditions({ env: { COLLAB_YTEXT: '1' }, config: CONFIG, fetchImpl: fn });
			await assert.rejects(p, (err) => {
				assert.ok(!err.message.includes(CONFIG.baasUrl));
				assert.ok(!err.message.includes(CONFIG.serviceKey));
				return true;
			});
		}
	});

	it('g. refuses with baas not configured and makes no fetch call when the service key is empty', async () => {
		const fn = fakeFetch(() => ({ ok: true, status: 200 }));
		const p = checkYtextPreconditions({ env: { COLLAB_YTEXT: '1' }, config: { ...CONFIG, serviceKey: '' }, fetchImpl: fn });
		await assert.rejects(p, /baas not configured/);
		assert.equal(fn.calls.length, 0);
	});

	it('h. a real deadline abort refuses with TimeoutError', async () => {
		const fn = fakeFetch((url, init) => new Promise((resolve, reject) => {
			// Resolve later than the deadline: AbortSignal.timeout's timer is unref'd, so this
			// ref'd fallback keeps the loop alive and only the real abort can settle the probe.
			const timer = setTimeout(() => resolve({ ok: true, status: 200 }), 50);
			init.signal.addEventListener('abort', () => {
				clearTimeout(timer);
				reject(init.signal.reason);
			});
		}));
		const p = checkYtextPreconditions({ env: { COLLAB_YTEXT: '1' }, config: CONFIG, fetchImpl: fn, timeoutMs: 20 });
		await assert.rejects(p, /TimeoutError/);
	});
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-session-revocation-poller.test.mjs          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The revocation poller started the way bridge-api.mjs starts it: with no poll options. Every
// other test passes a timeoutMs, which is how a poller with no default deadline shipped: the
// public bridge logged "timed out after undefined ms" and answered 503 on every token
// (2026-10-23). The answer below arrives after 20 ms; setTimeout(…, undefined) fires after 1.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionRevocations, startSessionRevocationPoller } from '../../scripts/bridge-session-revocations.mjs';

const slowEmptyTable = () => new Promise((resolve) => {
	setTimeout(() => resolve(new Response('[]', { status: 200, headers: { 'content-range': '*/0' } })), 20);
});

describe('the revocation poller with the production options (none)', () => {
	it('loads a table that answers in 20 ms and serves tokens', async () => {
		const warnings = [];
		const tracker = new SessionRevocations({ enforced: true, log: { info() {}, warn: (line) => warnings.push(line) } });
		const poller = startSessionRevocationPoller(tracker, { fetchImpl: slowEmptyTable, baasUrl: 'http://baas.local', serviceKey: 'service-key' });
		try {
			await poller.tick();
			assert.equal(tracker.status(), 'fresh');
			assert.deepEqual(warnings.filter((line) => /timed out/.test(line)), []);
		} finally {
			poller.stop();
		}
	});
});

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-tasks-reminder-scan.test.mjs                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The due-date reminder scan runs from a bare setInterval. A rejection inside it is an
// unhandled rejection, which Node 22 turns into a process exit.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const OWNER = 'a1a1a1a1-1111-4111-8111-a1a1a1a1a1a1';
const PAGE = 'b2b2b2b2-2222-4222-8222-b2b2b2b2b2b2';
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const config = { baasUrl: 'http://baas.test', serviceKey: 'svc', vapid: { publicKey: 'pub' } };
const answer = (rows, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(rows) });
const flush = async () => { for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

/** A fresh module instance, because the scan timer is a module singleton. */
const freshTasksModule = () => import(`../../scripts/bridge-tasks.mjs?scan=${Math.random()}`);

describe('reminder scan', () => {
	it('reminder scan rejection does not reach unhandledRejection; a tick during a running scan is skipped', async (t) => {
		t.mock.timers.enable({ apis: ['setInterval'] });
		const rejections = [];
		const onRejection = (reason) => rejections.push(reason);
		process.on('unhandledRejection', onRejection);
		t.after(() => process.off('unhandledRejection', onRejection));
		const warnings = t.mock.method(console, 'warn', () => {});
		const taskReads = [];
		let releaseFirstRead;
		const fetchImpl = async (url) => {
			if (url.includes('osionos_tasks')) {
				taskReads.push(url);
				if (taskReads.length === 1) await new Promise((resolve) => { releaseFirstRead = resolve; });
				return answer([{ page_id: PAGE, owner_id: OWNER, content: 'ship it' }]);
			}
			if (url.includes('osionos_push_subscriptions')) return answer({ message: 'upstream down' }, 500);
			return answer([]);
		};
		const { createTasksHandler } = await freshTasksModule();
		createTasksHandler({ config, verifySession: () => ({}), fetchImpl, env: {} });

		t.mock.timers.tick(FIFTEEN_MINUTES);
		await flush();
		t.mock.timers.tick(FIFTEEN_MINUTES);
		await flush();
		assert.equal(taskReads.length, 1, 'the second tick must be skipped while the first scan runs');

		releaseFirstRead();
		await flush();
		assert.deepEqual(rejections, []);
		const lines = warnings.mock.calls.map((call) => String(call.arguments[0]));
		assert.deepEqual(lines, ['[osionos-bridge] reminder scan failed (status 502)']);
		assert.ok(!lines[0].includes(OWNER) && !lines[0].includes(PAGE));

		t.mock.timers.tick(FIFTEEN_MINUTES);
		await flush();
		assert.equal(taskReads.length, 2, 'a finished scan releases the guard');
	});
});

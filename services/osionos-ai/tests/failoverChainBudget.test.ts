import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startKit, typesOf, lastOf } from './failoverKit.ts';

/**
 * FA17 / R16: when the chain has no first-part time left, it starts no new
 * attempt. The clock of the run moves 80 s per upstream request, so the 150 s
 * budget is gone after two attempts; the real stall is not waited for.
 */
const kit = await startKit();
const { app, failing, bridge, mock, runToEnd, settledLedger, runRow, clean } = kit;
const { clock } = await import('../src/tools/limits.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await failing.close();
});

describe('the chain budget closes the chain', () => {
	it('the third model gets no request once 150 s are spent, and nothing stays reserved', async () => {
		await clean();
		const realNow = clock.now;
		clock.now = () => realNow() + 80_000 * failing.requests.length;
		try {
			failing.always('mock-metered', 503);
			failing.always('mock-vision', 503);
			failing.always('mock-platform', 503);
			const { runId, events } = await runToEnd({
				model: 'mock-metered',
				fallbacks: [{ model: 'mock-vision' }, { model: 'mock-platform' }],
			});
			assert.deepEqual(failing.requests, ['mock-metered', 'mock-vision']);
			assert.equal(failing.countFor('mock-platform'), 0);
			assert.equal(typesOf(events).filter((type) => type === 'route').length, 1);
			// The end is the last attempt's own failure (a 503 here; a stall ends as a timeout).
			assert.equal((lastOf(events).data as { code: string }).code, 'provider_unavailable');
			const row = await runRow(runId);
			assert.equal(row.status, 'failed');
			assert.equal(row.usage?.attempts?.some((a) => a.model === 'mock-platform'), false);
			const { user, platform } = await settledLedger();
			assert.deepEqual([user, platform], [{ spent: 0, reserved: 0 }, { spent: 0, reserved: 0 }]);
		} finally {
			clock.now = realNow;
		}
	});

	it('a one-route run with the budget gone is not retried', async () => {
		await clean();
		const realNow = clock.now;
		clock.now = () => realNow() + 200_000 * failing.requests.length;
		try {
			failing.always('mock-metered', 503);
			const { runId } = await runToEnd({ model: 'mock-metered' });
			assert.deepEqual(failing.requests, ['mock-metered']);
			assert.equal((await runRow(runId)).status, 'failed');
			const { user, platform } = await settledLedger();
			// The one failed attempt is booked at its estimate (as any failed one-route run is); nothing stays reserved.
			assert.equal(user.reserved + platform.reserved, 0);
			assert.equal(user.spent, platform.spent);
		} finally {
			clock.now = realNow;
		}
	});
});

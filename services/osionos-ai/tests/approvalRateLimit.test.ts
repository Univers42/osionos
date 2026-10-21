import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { startHarness } from './harness.ts';

/**
 * The decision route is rate-limited like a run.
 *
 * The window is tight here — two decisions a minute — so the third one is
 * refused. The limit is the one of the runs: the same window, the same
 * counter, the same code.
 */
process.env.OSIONOS_AI_RUNS_PER_MINUTE = '2';

const { app, bridge, mock, tokenFor, call } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

/** A user of its own: its window is its own. */
const USER_C = '33333333-3333-4333-8333-333333333333';

describe('the rate limit of the decisions', () => {
	it('the third decision of the window is refused', async () => {
		const token = tokenFor(USER_C, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
		const id = randomUUID();
		const first = await call(`/api/ai/approvals/${id}`, { method: 'POST', token, body: { decision: 'approve' } });
		const second = await call(`/api/ai/approvals/${id}`, { method: 'POST', token, body: { decision: 'approve' } });
		const third = await call(`/api/ai/approvals/${id}`, { method: 'POST', token, body: { decision: 'approve' } });
		// The first two answer 404: the approval does not exist. The third one
		// never gets there: the window is full.
		assert.equal(first.status, 404);
		assert.equal(second.status, 404);
		assert.equal(third.status, 429);
		assert.equal((third.body as { code: string }).code, 'rate_limited');
	});
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { startHarness, USER_A, WORKSPACE_A } from './harness.ts';

/** The write budget (AM9): an auto write already sent finishes and records its outcome. */
const { app, bridge, mock, createConversation } = await startHarness();
const { CLAIM_MARGIN_MS, makeWriteBudget } = await import('../src/modes/writeBudget.ts');
const { claimApproval } = await import('../src/approvals/claim.ts');
const { applyClaimed } = await import('../src/approvals/apply.ts');
const { getOwnedApproval } = await import('../src/approvals/repo.ts');
const { EXECUTING_TIMEOUT_MS } = await import('../src/approvals/timeouts.ts');
const { TOTAL_TIMEOUT_MS } = await import('../src/runs/streamPump.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('makeWriteBudget', () => {
	it('canClaim is false 20 s before the deadline and true with room to spare', () => {
		const budget = makeWriteBudget({ startedAtMs: 1_000, totalMs: 120_000, signal: new AbortController().signal });
		assert.equal(budget.deadlineAtMs, 121_000);
		assert.equal(budget.canClaim(121_000 - 20_000), false);
		assert.equal(budget.canClaim(121_000 - CLAIM_MARGIN_MS), true);
		assert.equal(budget.canClaim(1_000), true);
	});

	it('canClaim is false after abort, and a tracked write still resolves', async () => {
		const controller = new AbortController();
		const budget = makeWriteBudget({ startedAtMs: 0, totalMs: 120_000, signal: controller.signal });
		const write = budget.track(sleep(50).then(() => 'landed'));
		controller.abort();
		assert.equal(budget.aborted(), true);
		assert.equal(budget.canClaim(0), false);
		await budget.settle();
		assert.equal(await write, 'landed');
	});

	it('settle waits for writes tracked meanwhile and survives a rejection', async () => {
		const budget = makeWriteBudget({ startedAtMs: 0, totalMs: 1, signal: new AbortController().signal });
		let landed = 0;
		budget.track(sleep(20).then(() => { budget.track(sleep(20).then(() => landed++)); }));
		budget.track(Promise.reject(new Error('bridge down')).catch((error: Error) => { throw error; })).catch(() => undefined);
		await budget.settle();
		assert.equal(landed, 1);
	});
});

describe('the executing window outlives a run and its last claim', () => {
	it('EXECUTING_TIMEOUT_MS > TOTAL_TIMEOUT_MS + CLAIM_MARGIN_MS', () => {
		assert.ok(EXECUTING_TIMEOUT_MS > TOTAL_TIMEOUT_MS + CLAIM_MARGIN_MS);
	});
});

async function seedPending(conversationId: string, runId: string, pageId: string): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.ai_approvals (id, owner_id, workspace_id, tool, args, args_sha256, status, origin, conversation_id, run_id, expires_at)
		 values ($1, $2, $3, 'add_blocks', $4::jsonb, $5, 'pending', 'run', $6, $7, now() + interval '10 minutes')`,
		[id, USER_A, WORKSPACE_A, JSON.stringify({ pageId, blocks: [{ type: 'paragraph', content: 'x' }] }), `wb-${id}`, conversationId, runId],
	);
	return id;
}

describe('an aborted run still settles its auto writes (AM9)', () => {
	it('two claimed writes, abort after the second claim: none stays executing', async () => {
		const conversationId = await createConversation();
		const runId = randomUUID();
		await app.db.query(`insert into public.ai_runs (id, conversation_id, owner_id, status, model) values ($1, $2, $3, 'running', 'm')`, [runId, conversationId, USER_A]);
		const pageId = randomUUID();
		await app.db.query(
			`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, content) values ($1, $2, $3, 'P', 'shared', '[]'::jsonb)`,
			[pageId, WORKSPACE_A, USER_A],
		);
		bridge.seedPage(pageId, [], 1);
		bridge.delayMs = 300;
		const controller = new AbortController();
		const budget = makeWriteBudget({ startedAtMs: Date.now(), totalMs: TOTAL_TIMEOUT_MS, signal: controller.signal });
		const ids = [await seedPending(conversationId, runId, pageId), await seedPending(conversationId, runId, pageId)];
		for (const id of ids) {
			const claimed = await claimApproval(app.db, { id, ownerId: USER_A, next: 'executing', decidedBy: 'auto:auto' });
			assert.ok(claimed, 'the auto claim won');
			budget.track(applyClaimed({ db: app.db, bridgeUrl: bridge.baseUrl, token: 't' }, claimed));
		}
		controller.abort();
		const midway = await app.db.query(`select status from public.ai_approvals where run_id = $1`, [runId]);
		assert.ok(midway.rows.some((row) => row.status === 'executing'), 'the writes are still in flight at the abort');
		await budget.settle();
		const rows = await app.db.query(`select id, status from public.ai_approvals where run_id = $1 and decided_by like 'auto:%'`, [runId]);
		assert.equal(rows.rows.length, 2);
		for (const row of rows.rows) assert.ok(['executed', 'failed'].includes(row.status), `${row.id} is ${row.status}`);
		assert.equal((await getOwnedApproval(app.db, { id: ids[1], ownerId: USER_A }))?.status, 'executed');
		bridge.delayMs = 0;
	});

	it('a real run aborted after its second auto write is claimed', { todo: 'Task 15: needs autoDecide wired through the run write budget' }, () => {
		assert.fail('pending Task 15');
	});
});

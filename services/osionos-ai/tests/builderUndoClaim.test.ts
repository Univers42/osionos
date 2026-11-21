import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import {
	USER_A, WORKSPACE_A, allItems, app, approvalStatus, bridge, buildPartial, buildPlan, closeBuilderHarness,
	holdPatch, installUndoHooks, patchedIds, seedBuiltPages, tokenFor, undo,
} from './undoHarness.ts';

const { sweepApprovals, getOwnedApproval, EXECUTING_TIMEOUT_MS } = await import('../src/approvals/repo.ts');
const { BRIDGE_TIMEOUT_MS } = await import('../src/approvals/bridge.ts');
const { undoBuild } = await import('../src/builders/undo.ts');

/**
 * osionos#333 (groot ADR 0071): the claim an undo of a partial approval holds,
 * what hands it back, and the budget that bounds one undo pass.
 */
after(closeBuilderHarness);

describe('builder undo claim and budget (osionos#333)', () => {
	installUndoHooks();

	it('Q3 the claim restarts the sweeper clock: an hour-old partial is not swept mid-undo', async () => {
		const { approvalId, ids } = await buildPartial();
		await app.db.query(`update public.ai_approvals set decided_at = now() - interval '1 hour' where id = $1`, [approvalId]);
		const held = holdPatch(ids.about!);
		const undoing = undo(approvalId);
		await held.reached;

		await sweepApprovals(app.db);
		const midUndo = await approvalStatus(approvalId);
		held.release();
		assert.equal(midUndo, 'executing');
		assert.equal((await undoing).status, 200);
		assert.equal(await approvalStatus(approvalId), 'partial');
	});

	it('Q4 a throw inside undoBuild hands the row back as partial', async () => {
		const { approvalId } = await buildPartial();
		await app.db.query(`create or replace function public.test_undo_throw() returns trigger language plpgsql
			as $$ begin raise exception 'injected undo failure'; end $$`);
		await app.db.query(`create trigger test_undo_throw before update on public.ai_plan_items
			for each row when (new.status = 'undone') execute function public.test_undo_throw()`);
		try {
			const answer = await undo(approvalId);
			assert.equal(answer.status, 500);
		} finally {
			await app.db.query('drop trigger test_undo_throw on public.ai_plan_items');
			await app.db.query('drop function public.test_undo_throw()');
		}
		assert.equal(await approvalStatus(approvalId), 'partial');
		assert.deepEqual(patchedIds(), []);
	});

	it('Q5 an undo whose row the sweeper took says so instead of a plain 200', async () => {
		const { approvalId, ids } = await buildPartial();
		const held = holdPatch(ids.about!);
		const undoing = undo(approvalId);
		await held.reached;

		const swept = await sweepApprovals(app.db, { now: new Date(Date.now() + EXECUTING_TIMEOUT_MS + 60_000) });
		held.release();
		assert.equal(swept.unknown, 1);
		const answer = await undoing;
		assert.equal(answer.status, 409);
		assert.equal((answer.body as { code?: string }).code, 'approval_swept');
		assert.equal((answer.body as { undone?: number }).undone, 2, 'the answer still says what was archived');
		assert.equal(await approvalStatus(approvalId), 'unknown');
	});

	it('Q4 a second undo of a partial approval is 409 nothing_to_undo and hands the row back', async () => {
		const { approvalId } = await buildPartial();
		assert.equal((await undo(approvalId)).status, 200);
		bridge.reset();

		const second = await undo(approvalId);
		assert.equal(second.status, 409);
		assert.equal((second.body as { code?: string }).code, 'nothing_to_undo');
		assert.equal(await approvalStatus(approvalId), 'partial');
		assert.deepEqual(patchedIds(), []);
	});

	it('Q6 the budget stops an undo between items, and a second undo finishes the rest', async () => {
		const { approvalId } = await buildPlan();
		await seedBuiltPages(approvalId);
		bridge.reset();
		// Each landed PATCH moves the clock 1 ms: the first item starts with exactly
		// one full PATCH timeout left, the second with 1 ms less, so it waits (I1).
		let clock = 0;
		const archive = bridge.onPatch!;
		bridge.onPatch = async (call) => {
			await archive(call);
			clock += 1;
		};
		const first = await undoWithClock(approvalId, BRIDGE_TIMEOUT_MS, () => clock);
		assert.deepEqual(first, { undone: 1, kept: 0, keptDatabases: 1, failed: 0, remaining: 2 });
		const reached = (await allItems(app.db, approvalId)).filter((item) => item.status === 'undone');
		assert.deepEqual(reached.map((item) => item.item_key), ['about']);

		const second = await undo(approvalId);
		assert.equal(second.status, 200);
		assert.equal((second.body as { undone?: number }).undone, 2);
		assert.equal((second.body as { remaining?: number }).remaining, 0);
	});

	it('I1 an undo with less than one full PATCH timeout left starts no item', async () => {
		const { approvalId } = await buildPlan();
		await seedBuiltPages(approvalId);
		bridge.reset();
		const result = await undoWithClock(approvalId, BRIDGE_TIMEOUT_MS - 1, () => 0);
		assert.deepEqual(result, { undone: 0, kept: 0, keptDatabases: 1, failed: 0, remaining: 3 });
		assert.deepEqual(patchedIds(), [], 'a PATCH is never sent with a shortened timeout');
	});
});

/** One undo pass of user A's approval, on a budget and a clock the test owns. */
async function undoWithClock(approvalId: string, budgetMs: number, now: () => number) {
	const approval = await getOwnedApproval(app.db, { id: approvalId, ownerId: USER_A });
	return undoBuild({ db: app.db, sessionToken: tokenFor(USER_A, WORKSPACE_A), approval: approval!, budgetMs, now });
}

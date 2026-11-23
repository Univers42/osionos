import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';

/**
 * The undo routes of applied writes with the flag off (I1): the turn undo is a
 * 404, and an approval undo of a non-plan row answers what it did before the
 * modes work (409 not_a_plan), whether or not the row recorded an inverse.
 */
delete process.env.OSIONOS_AI_MODES;
delete process.env.OSIONOS_AI_MODES_USERS;

const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');
const { app, mock, bridge, call, tokenFor, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const token = tokenFor(USER_A, WORKSPACE_A);

async function seedApplied(): Promise<{ runId: string; approvalId: string }> {
	const conversationId = await createConversation('flag-off-undo');
	const runId = randomUUID();
	await app.db.query(
		`insert into public.ai_runs (id, conversation_id, owner_id, status, model, turn_id) values ($1, $2, $3, 'succeeded', 'm', $1)`,
		[runId, conversationId, USER_A],
	);
	const approvalId = randomUUID();
	await app.db.query(
		`insert into public.ai_approvals
		   (id, origin, run_id, conversation_id, owner_id, workspace_id, tool, args, args_sha256, status, result, decided_by, expires_at)
		 values ($1::uuid, 'run', $2, $3, $4, $5, 'add_blocks', '{}'::jsonb, $1::text, 'executed', $6::jsonb, 'auto:auto', now() + interval '10 minutes')`,
		[approvalId, runId, conversationId, USER_A, WORKSPACE_A, JSON.stringify({ ok: true, tool: 'add_blocks', pageId: 'p', version: 1, blocks: [], summary: 's' })],
	);
	return { runId, approvalId };
}

describe('undo routes, flag off', () => {
	it('POST /runs/:id/undo-writes answers 404 for a run with an undoable write', async () => {
		const { runId } = await seedApplied();
		const answer = await call(`/api/ai/runs/${runId}/undo-writes`, { method: 'POST', token, body: {} });
		assert.equal(answer.status, 404);
		assert.equal((answer.body as { error?: { code?: string } }).error?.code ?? (answer.body as { code?: string }).code, 'not_found');
	});

	it('POST /approvals/:id/undo of a non-plan row with a recorded inverse is not_a_plan, as before', async () => {
		const { approvalId } = await seedApplied();
		const answer = await call(`/api/ai/approvals/${approvalId}/undo`, { method: 'POST', token, body: {} });
		assert.equal(answer.status, 409);
		assert.equal((answer.body as { code?: string }).code, 'not_a_plan');
		assert.equal(bridge.calls.filter((c) => c.method !== 'GET').length, 0);
	});
});

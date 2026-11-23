import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';

/** The applied list (AM19) and the decided_by of an approval description. */
const USER_OTHER = '33333333-3333-4333-8333-333333333333';
process.env.OSIONOS_AI_MODES = 'on';
process.env.OSIONOS_AI_MODES_USERS = USER_OTHER;

const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');
const { app, mock, bridge, call, tokenFor, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const DAY_MS = 24 * 60 * 60_000;
const token = tokenFor(USER_A, WORKSPACE_A);
const list = (id: string, tok = token) => call(`/api/ai/conversations/${id}/applied`, { token: tok });

async function seedRun(conversationId: string): Promise<string> {
	const runId = randomUUID();
	await app.db.query(
		`insert into public.ai_runs (id, conversation_id, owner_id, status, model, turn_id)
		 values ($1, $2, $3, 'succeeded', 'm', $4)`,
		[runId, conversationId, USER_A, runId],
	);
	return runId;
}

interface Seed {
	tool: string;
	decidedBy: string | null;
	result: Record<string, unknown>;
	ageDays?: number;
	decidedAgoMin?: number;
	status?: string;
}

async function seed(conversationId: string, runId: string, s: Seed): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.ai_approvals
		   (id, origin, run_id, conversation_id, owner_id, workspace_id, tool, args, args_sha256, status, result, decided_by, created_at, decided_at, expires_at)
		 values ($1::uuid, 'run', $2, $3, $4, $5, $6, '{"title":"T"}'::jsonb, $1::text, $7, $8::jsonb, $9,
		         now() - ($10::int * interval '1 day'), now() - ($11::int * interval '1 minute'), now() + interval '10 minutes')`,
		[id, runId, conversationId, USER_A, WORKSPACE_A, s.tool, s.status ?? 'executed', JSON.stringify({ ok: true, tool: s.tool, ...s.result }), s.decidedBy, s.ageDays ?? 0, s.decidedAgoMin ?? 0],
	);
	return id;
}

const blocks = { pageId: 'p1', version: 3, blocks: [], summary: 'added 1 block' };
const rename = { pageId: 'p2', previousTitle: 'Old', appliedTitle: 'T' };

describe('applied list', () => {
	it('lists the auto rows newest first, with the real undo window, and describes decidedBy on all three rows', async () => {
		const conversationId = await createConversation('applied');
		const runId = await seedRun(conversationId);
		const older = await seed(conversationId, runId, { tool: 'add_blocks', decidedBy: 'auto:auto', result: blocks, decidedAgoMin: 5 });
		const newer = await seed(conversationId, runId, { tool: 'rename_page', decidedBy: 'auto:auto', result: rename, decidedAgoMin: 1 });
		const manual = await seed(conversationId, runId, { tool: 'add_blocks', decidedBy: 'user', result: blocks });

		const res = await list(conversationId);
		assert.equal(res.status, 200);
		const items = (res.body as { items: Record<string, unknown>[] }).items;
		assert.deepEqual(items.map((i) => i.approvalId), [newer, older]);
		const created = await app.db.query('select created_at from public.ai_approvals where id = $1', [newer]);
		for (const item of items) {
			assert.equal(item.decidedBy, 'auto:auto');
			assert.equal(item.undoable, true);
			assert.equal(item.undoneAt, null);
			assert.equal(item.turnId, runId);
			assert.equal(item.runId, runId);
		}
		assert.equal(items[0].undoUntil, new Date(new Date(created.rows[0].created_at).getTime() + 7 * DAY_MS).toISOString());
		assert.equal(items[0].target, 'p2');
		assert.equal(items[0].summary, 'the page is now named "T"');
		assert.equal(items[1].target, 'p1');
		assert.equal(items[1].summary, 'added 1 block');
		assert.ok(!JSON.stringify(res.body).includes('args'));

		for (const [id, by] of [[newer, 'auto:auto'], [older, 'auto:auto'], [manual, 'user']] as const) {
			const described = (await call(`/api/ai/approvals/${id}`, { token })).body as Record<string, unknown>;
			assert.equal(described.decidedBy, by);
			assert.equal(described.undoneAt, null);
			assert.equal(described.undoable, true);
		}
	});

	it('undoable flips off for an undone row and for one past the window; failed and other conversations are absent', async () => {
		const conversationId = await createConversation('applied2');
		const other = await createConversation('applied3');
		const runId = await seedRun(conversationId);
		const otherRun = await seedRun(other);
		const undone = await seed(conversationId, runId, { tool: 'add_blocks', decidedBy: 'auto:accept_edits', result: { ...blocks, undoneAt: new Date().toISOString() } });
		const old = await seed(conversationId, runId, { tool: 'add_blocks', decidedBy: 'auto:auto', result: blocks, ageDays: 8 });
		await seed(conversationId, runId, { tool: 'add_blocks', decidedBy: 'auto:auto', result: blocks, status: 'failed' });
		await seed(other, otherRun, { tool: 'add_blocks', decidedBy: 'auto:auto', result: blocks });

		const items = ((await list(conversationId)).body as { items: Record<string, unknown>[] }).items;
		assert.equal(items.length, 2);
		const byId = new Map(items.map((i) => [i.approvalId, i]));
		assert.equal(byId.get(undone)?.undoable, false);
		assert.ok(typeof byId.get(undone)?.undoneAt === 'string');
		assert.equal(byId.get(old)?.undoable, false);
		const described = (await call(`/api/ai/approvals/${old}`, { token })).body as Record<string, unknown>;
		assert.equal(described.undoable, false);
	});

	it('is 404 for another user, an unknown id, and a malformed id', async () => {
		const conversationId = await createConversation('applied4');
		assert.equal((await list(conversationId, tokenFor(USER_OTHER, WORKSPACE_A))).status, 404);
		assert.equal((await list(randomUUID())).status, 404);
		assert.equal((await list('nope')).status, 404);
	});
});

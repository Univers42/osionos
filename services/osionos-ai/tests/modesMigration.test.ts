import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { startHarness, USER_A, WORKSPACE_A } from './harness.ts';

/**
 * The modes migration (AM7, AM10, AM3): a conversation that predates it reads
 * as manual and tainted, a new one as manual and clean, 'bypass' is refused by
 * the database, an approval keeps every byte, and a run's turn id defaults to
 * its own id. The legacy rows are made by dropping the new columns and
 * replaying the migration file (mounted at OSIONOS_AI_MODELS_DIR by test.sh).
 */
const { app, mock } = await startHarness();
const { insertRun } = await import('../src/runs/repo.ts');
const migration = readFileSync(`${process.env.OSIONOS_AI_MODELS_DIR ?? '/models'}/osionos-ai-modes-migration.sql`, 'utf8');

after(async () => {
	await app.close();
	await mock.close();
});

async function dropModesColumns(): Promise<void> {
	await app.db.query(`alter table public.ai_conversations
		drop column if exists assist_mode, drop column if exists assist_anchor_page_id,
		drop column if exists assist_mode_set_at, drop column if exists provenance_tainted_at,
		drop column if exists provenance_reason`);
	await app.db.query('drop index if exists public.ai_approvals_auto_turn');
	await app.db.query('alter table public.ai_approvals drop column if exists decided_by');
	await app.db.query('alter table public.ai_runs drop column if exists turn_id');
}

async function conversation(): Promise<string> {
	const id = randomUUID();
	await app.db.query('insert into public.ai_conversations (id, owner_id, workspace_id) values ($1, $2, $3)', [id, USER_A, WORKSPACE_A]);
	return id;
}

describe('osionos-ai modes migration', () => {
	it('a legacy conversation and approval survive the migration, twice', async () => {
		await dropModesColumns();
		const conversationId = await conversation();
		const runId = randomUUID();
		await app.db.query(`insert into public.ai_runs (id, conversation_id, owner_id, status, model) values ($1, $2, $3, 'succeeded', 'm')`, [runId, conversationId, USER_A]);
		const approval = await app.db.query(
			`insert into public.ai_approvals (run_id, conversation_id, owner_id, workspace_id, tool, args, args_sha256, status, result, expires_at)
			 values ($1, $2, $3, $4, 't', '{"b":1,"a":[2]}'::jsonb, 'h', 'executed', '{"ok":true}'::jsonb, now()) returning id`,
			[runId, conversationId, USER_A, WORKSPACE_A],
		);
		const before = await app.db.query('select args::text, result::text, status from public.ai_approvals where id = $1', [approval.rows[0].id]);

		await app.db.query(migration);
		await app.db.query(migration);

		const row = (await app.db.query('select assist_mode, provenance_reason, provenance_tainted_at from public.ai_conversations where id = $1', [conversationId])).rows[0];
		assert.equal(row.assist_mode, 'manual');
		assert.equal(row.provenance_reason, 'legacy');
		assert.notEqual(row.provenance_tainted_at, null);
		const after = await app.db.query('select args::text, result::text, status, decided_by from public.ai_approvals where id = $1', [approval.rows[0].id]);
		assert.deepEqual({ ...after.rows[0], decided_by: undefined }, { ...before.rows[0], decided_by: undefined });
		assert.equal(after.rows[0].decided_by, null);
	});

	it('a new conversation is manual and clean', async () => {
		const id = await conversation();
		const row = (await app.db.query('select assist_mode, provenance_tainted_at, provenance_reason from public.ai_conversations where id = $1', [id])).rows[0];
		assert.equal(row.assist_mode, 'manual');
		assert.equal(row.provenance_tainted_at, null);
		assert.equal(row.provenance_reason, null);
	});

	it('the database refuses bypass, an unknown reason and an unknown decider', async () => {
		const id = await conversation();
		await assert.rejects(app.db.query(`update public.ai_conversations set assist_mode = 'bypass' where id = $1`, [id]), { code: '23514' });
		await assert.rejects(app.db.query(`update public.ai_conversations set provenance_reason = 'nope' where id = $1`, [id]), { code: '23514' });
		const runId = randomUUID();
		await app.db.query(`insert into public.ai_runs (id, conversation_id, owner_id, status, model) values ($1, $2, $3, 'succeeded', 'm')`, [runId, id, USER_A]);
		const approval = await app.db.query(
			`insert into public.ai_approvals (run_id, conversation_id, owner_id, workspace_id, tool, args, args_sha256, status, expires_at)
			 values ($1, $2, $3, $4, 't', '{}'::jsonb, 'h', 'pending', now()) returning id`,
			[runId, id, USER_A, WORKSPACE_A],
		);
		await assert.rejects(app.db.query(`update public.ai_approvals set decided_by = 'robot' where id = $1`, [approval.rows[0].id]), { code: '23514' });
		await app.db.query(`update public.ai_approvals set decided_by = 'auto:auto' where id = $1`, [approval.rows[0].id]);
	});

	it('insertRun stores the turn id, defaulting to the run id', async () => {
		const id = await conversation();
		const first = randomUUID();
		const second = randomUUID();
		const turn = randomUUID();
		assert.equal((await insertRun(app.db, { runId: first, conversationId: id, ownerId: USER_A, model: 'm' })).kind, 'inserted');
		assert.equal((await insertRun(app.db, { runId: second, conversationId: await conversation(), ownerId: USER_A, model: 'm', turnId: turn })).kind, 'inserted');
		const rows = await app.db.query('select id, turn_id from public.ai_runs where id = any($1)', [[first, second]]);
		const byId = new Map(rows.rows.map((r) => [r.id, r.turn_id]));
		assert.equal(byId.get(first), first);
		assert.equal(byId.get(second), turn);
	});
});

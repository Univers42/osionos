import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { startHarness, USER_A, WORKSPACE_A } from './harness.ts';

/**
 * I3: a database error while reading the title a rename replaces must not stop
 * the rename. The write still goes out and the row is recorded as executed,
 * with no inverse (a null previous title), instead of throwing with the row
 * left 'executing'.
 */
const { app, bridge, mock, tokenFor, createConversation } = await startHarness();
const { applyClaimed } = await import('../src/approvals/apply.ts');
const { getOwnedApproval } = await import('../src/approvals/repo.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

/** A pool whose read of the page titles fails, every other query passing through. */
const titleReadFails = {
	query: (sql: string, params?: unknown[]) =>
		/from public\.osionos_pages/.test(sql) ? Promise.reject(new Error('pool timeout')) : app.db.query(sql, params),
} as unknown as Pool;

describe('rename_page when the title read fails', () => {
	it('still writes, records the row executed and records no inverse', async () => {
		const pageId = randomUUID();
		await app.db.query(
			`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, content) values ($1, $2, $3, 'Old', 'shared', '[]'::jsonb)`,
			[pageId, WORKSPACE_A, USER_A],
		);
		bridge.seedPage(pageId, [], 1, 'Old');
		const conversationId = await createConversation('title-read');
		const runId = randomUUID();
		await app.db.query(
			`insert into public.ai_runs (id, conversation_id, owner_id, status, model, turn_id) values ($1, $2, $3, 'running', 'm', $1)`,
			[runId, conversationId, USER_A],
		);
		const id = randomUUID();
		await app.db.query(
			`insert into public.ai_approvals
			   (id, origin, run_id, conversation_id, owner_id, workspace_id, tool, args, args_sha256, status, expires_at)
			 values ($1::uuid, 'run', $2, $3, $4, $5, 'rename_page', $6::jsonb, $1::text, 'executing', now() + interval '10 minutes')`,
			[id, runId, conversationId, USER_A, WORKSPACE_A, JSON.stringify({ pageId, title: 'New' })],
		);
		const row = await getOwnedApproval(app.db, { id, ownerId: USER_A });
		assert.ok(row);
		bridge.reset();
		const applied = await applyClaimed({ db: titleReadFails, bridgeUrl: bridge.baseUrl, token: tokenFor(USER_A, WORKSPACE_A) }, row);
		assert.equal(applied.status, 'executed');
		assert.equal(bridge.calls.filter((c) => c.method === 'PATCH').length, 1);
		const after = await app.db.query('select status, result from public.ai_approvals where id = $1', [id]);
		assert.equal(after.rows[0].status, 'executed');
		assert.equal(after.rows[0].result.previousTitle ?? null, null);
	});
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

/**
 * Undo of an applied write (AM8), at the turn and over HTTP: the create_page
 * scope, the refusals of any tool, and the run and approval undo routes.
 */
const { app, bridge, call, ctx, USER_A, WORKSPACE_A, TOKEN, AI, HUMAN, aRun, page, executed, undo, recordedBlock, blocksRow, writes } = await import('./undoAppliedFixture.ts');

describe('create_page undo scope', () => {
	it('an outside-agent row never treats another agent row\'s page as its own child', async () => {
		const token = randomUUID();
		await app.db.query(
			`insert into public.ai_access_tokens (id, user_id, name, token_sha256, last4, scopes, workspace_ids, expires_at)
			 values ($1, $2, 'agent', $3, 'abcd', array['write_approval'], array[$4::uuid], now() + interval '30 days')`,
			[token, USER_A, randomUUID().replaceAll('-', '').repeat(2), WORKSPACE_A],
		);
		const parent = await page([], 'Agent page');
		const child = await page([], 'Other agent page', parent);
		await executed('create_page', { title: 'Other agent page' }, { createdPageId: child, parentPageId: parent }, 0, token);
		const approval = await executed('create_page', { title: 'Agent page' }, { createdPageId: parent, parentPageId: null }, 0, token);
		assert.deepEqual(await undo(approval), { ok: false, code: 'changed_since' });
		assert.equal(writes().length, 0);
	});

	it('a human page under a grandchild blocks the undo (the archive cascades)', async () => {
		ctx.run = await aRun();
		const parent = await page([], 'P');
		const child = await page([], 'C', parent);
		await page([], 'H, a human page', child);
		await executed('create_page', { title: 'C' }, { createdPageId: child, parentPageId: parent });
		const approval = await executed('create_page', { title: 'P' }, { createdPageId: parent, parentPageId: null });
		assert.deepEqual(await undo(approval), { ok: false, code: 'changed_since' });
		assert.equal(writes().length, 0);
	});
});

describe('refusals of any tool', () => {
	it('archive_page is not_undoable', async () => {
		const pageId = await page([]);
		const approval = await executed('archive_page', { pageId }, { pageId });
		assert.deepEqual(await undo(approval), { ok: false, code: 'not_undoable' });
	});

	it('an 8-day-old row is expired', async () => {
		const pageId = await page([HUMAN, AI]);
		assert.deepEqual(await undo(await blocksRow(pageId, 8)), { ok: false, code: 'expired' });
		assert.equal(bridge.count, 0);
	});
});

describe('POST /api/ai/runs/:id/undo-writes', () => {
	const post = (runId: string) => call(`/api/ai/runs/${runId}/undo-writes`, { method: 'POST', token: TOKEN, body: {} });

	it('undoes the turn in reverse order and reports per row', async () => {
		ctx.run = await aRun();
		const pageId = await page([HUMAN, AI], 'T');
		const first = await executed('rename_page', { pageId, title: 'T' }, { pageId, previousTitle: 'Before', appliedTitle: 'T' });
		const second = await executed('add_blocks', { pageId }, { pageId, version: 3, blocks: [recordedBlock(AI)], summary: 's' });
		const made = await page([], 'Made');
		const third = await executed('create_page', { title: 'Made' }, { createdPageId: made, parentPageId: null });
		await app.db.query(`update public.ai_approvals set created_at = now() - interval '3 minutes' where id = $1`, [first.id]);
		await app.db.query(`update public.ai_approvals set created_at = now() - interval '2 minutes' where id = $1`, [second.id]);
		await app.db.query(`update public.ai_approvals set created_at = now() - interval '1 minutes' where id = $1`, [third.id]);
		const answer = await post(ctx.run.runId);
		const body = answer.body as { results: { approvalId: string; ok: boolean; code?: string }[] };
		assert.equal(answer.status, 200);
		assert.deepEqual(body.results.map((r) => r.approvalId), [third.id, second.id, first.id]);
		assert.ok(body.results.every((r) => r.ok));
		assert.deepEqual(writes().map((c) => Object.keys(c.body as object).sort()), [['archivedAt'], ['baseVersion', 'content'], ['title']]);
	});

	it('stops at the first refusal and says which row', async () => {
		ctx.run = await aRun();
		const pageId = await page([HUMAN, AI], 'Other');
		const older = await executed('rename_page', { pageId, title: 'Other' }, { pageId, previousTitle: 'Before', appliedTitle: 'Other' });
		const newer = await blocksRow(pageId);
		await app.db.query(`update public.ai_approvals set created_at = now() - interval '2 minutes' where id = $1`, [older.id]);
		bridge.pageContent(pageId)!.content = [HUMAN];
		const fresh = await call(`/api/ai/runs/${ctx.run.runId}/undo-writes`, { method: 'POST', token: TOKEN, body: {} });
		const body = fresh.body as { results: { approvalId: string; ok: boolean; code?: string }[] };
		assert.equal(fresh.status, 409);
		assert.deepEqual(body.results.map((r) => [r.approvalId, r.ok, r.code]), [[newer.id, false, 'changed_since']]);
	});

	it('answers 404 for a run that is not the caller\'s', async () => {
		const answer = await post(randomUUID());
		assert.equal(answer.status, 404);
	});
});

describe('turn undo spans the decided continuations of the turn (I2)', () => {
	it('undoes a write made by a continuation run that shares the turn_id', async () => {
		ctx.run = await aRun();
		const first = ctx.run;
		const pageId = await page([HUMAN, AI], 'Turn');
		const a = await blocksRow(pageId);
		const continuation = await aRun();
		const turn = await app.db.query('select turn_id from public.ai_runs where id = $1', [first.runId]);
		await app.db.query('update public.ai_runs set turn_id = $2 where id = $1', [continuation.runId, turn.rows[0].turn_id ?? first.runId]);
		await app.db.query('update public.ai_runs set turn_id = $2 where id = $1', [first.runId, turn.rows[0].turn_id ?? first.runId]);
		const otherPage = await page([HUMAN, AI], 'Turn2');
		ctx.run = continuation;
		const b = await blocksRow(otherPage);
		const answer = await call(`/api/ai/runs/${first.runId}/undo-writes`, { method: 'POST', token: TOKEN, body: {} });
		const body = answer.body as { results: { approvalId: string; ok: boolean }[] };
		assert.equal(answer.status, 200);
		assert.deepEqual(body.results.map((r) => r.approvalId).sort(), [a.id, b.id].sort());
		assert.deepEqual(bridge.pageContent(otherPage)?.content, [HUMAN]);
	});
});

describe('POST /api/ai/approvals/:id/undo for an applied write (T17)', () => {
	const post = (id: string) => call(`/api/ai/approvals/${id}/undo`, { method: 'POST', token: TOKEN, body: {} });

	it('undoes an applied add_blocks over HTTP', async () => {
		ctx.run = await aRun();
		const pageId = await page([HUMAN, AI]);
		const row = await blocksRow(pageId);
		const answer = await post(row.id);
		assert.equal(answer.status, 200);
		assert.deepEqual(bridge.pageContent(pageId)?.content, [HUMAN]);
	});

	it('answers not_undoable for an archive_page row', async () => {
		ctx.run = await aRun();
		const row = await executed('archive_page', { pageId: randomUUID() }, {});
		const answer = await post(row.id);
		assert.equal(answer.status, 409);
		assert.equal((answer.body as { code?: string }).code, 'not_undoable');
	});
});

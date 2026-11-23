import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';
import { SseStream, collect } from './sse.ts';

/**
 * Undo of an applied write (AM8): add_blocks, rename_page and create_page are
 * undone only while the page still reads the way the write left it; every
 * other state is a named refusal and the page is left alone.
 */
// The undo routes are behind the flag (I1): this file runs them with it on.
process.env.OSIONOS_AI_MODES = 'on';
process.env.OSIONOS_AI_MODES_USERS = '33333333-3333-4333-8333-333333333333';
const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');
const { app, bridge, mock, postRun, tokenFor, createConversation, call } = await startHarness();
const { undoApplied } = await import('../src/approvals/undoApplied.ts');
const { blockDigest } = await import('../src/approvals/inverseData.ts');
const { getOwnedApproval } = await import('../src/approvals/repo.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const TOKEN = tokenFor(USER_A, WORKSPACE_A);
const AI = { id: 'ai1', type: 'paragraph', content: 'ai text' };
const HUMAN = { id: 'h1', type: 'paragraph', content: 'mine' };

/** A run, so that rows can name one. */
async function aRun(): Promise<{ runId: string; conversationId: string }> {
	const conversationId = await createConversation();
	await collect(new SseStream(await postRun(conversationId, randomUUID(), 'do it')));
	const row = await app.db.query('select id as run_id from public.ai_runs where conversation_id = $1 limit 1', [conversationId]);
	return { runId: row.rows[0].run_id, conversationId };
}

let run = await aRun();

beforeEach(() => bridge.reset());

async function page(content: unknown[], title = 'Notes', parent: string | null = null): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, content, parent_page_id)
		 values ($1, $2, $3, $4, 'shared', $5::jsonb, $6)`,
		[id, WORKSPACE_A, USER_A, title, JSON.stringify(content), parent],
	);
	bridge.seedPage(id, content, 3, title);
	return id;
}

/** An executed row of the run, as the apply core records it. */
async function executed(tool: string, args: Record<string, unknown>, result: Record<string, unknown>, ageDays = 0, mcpTokenId: string | null = null) {
	const id = randomUUID();
	await app.db.query(
		`insert into public.ai_approvals
		   (id, origin, token_id, run_id, conversation_id, owner_id, workspace_id, tool, args, args_sha256, status, result, decided_by, created_at, decided_at, expires_at)
		 values ($1, $11, $12::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8, 'executed', $9::jsonb, 'auto:auto',
		         now() - ($10::int * interval '1 day'), now() - ($10::int * interval '1 day'), now() + interval '10 minutes')`,
		[id, mcpTokenId ? null : run.runId, mcpTokenId ? null : run.conversationId, USER_A, WORKSPACE_A, tool, JSON.stringify(args), id, JSON.stringify({ ok: true, tool, ...result }), ageDays, mcpTokenId ? 'mcp' : 'run', mcpTokenId],
	);
	const row = await getOwnedApproval(app.db, { id, ownerId: USER_A });
	assert.ok(row);
	return row;
}

const undo = async (approval: Awaited<ReturnType<typeof executed>>) =>
	undoApplied({ db: app.db, bridgeUrl: bridge.baseUrl, sessionToken: TOKEN, approval });

const recordedBlock = (block: { id: string; type: string; content: unknown }) => ({ id: block.id, parentId: null, index: 0, sha256: blockDigest(block) });

async function blocksRow(pageId: string, ageDays = 0) {
	return executed('add_blocks', { pageId }, { pageId, version: 3, blocks: [recordedBlock(AI)], summary: 's' }, ageDays);
}

const writes = () => bridge.calls.filter((c) => c.method !== 'GET');

describe('add_blocks undo', () => {
	it('removes exactly the recorded blocks, carrying baseVersion', async () => {
		const pageId = await page([HUMAN, AI]);
		const result = await undo(await blocksRow(pageId));
		assert.deepEqual(result, { ok: true });
		const patch = writes()[0];
		assert.equal(patch.method, 'PATCH');
		assert.deepEqual(patch.body, { content: [HUMAN], baseVersion: 3 });
		assert.deepEqual(bridge.pageContent(pageId)?.content, [HUMAN]);
	});

	it('refuses when a block is missing', async () => {
		const pageId = await page([HUMAN]);
		assert.deepEqual(await undo(await blocksRow(pageId)), { ok: false, code: 'changed_since' });
		assert.equal(writes().length, 0);
	});

	it('refuses when a block moved under another parent', async () => {
		const pageId = await page([{ ...HUMAN, children: [AI] }]);
		assert.deepEqual(await undo(await blocksRow(pageId)), { ok: false, code: 'changed_since' });
		assert.equal(writes().length, 0);
	});

	it('refuses when a block was edited (R5: the edit is a conflict copy, the AI text stays)', async () => {
		const pageId = await page([HUMAN, { ...AI, content: 'edited by a human' }]);
		assert.deepEqual(await undo(await blocksRow(pageId)), { ok: false, code: 'changed_since' });
		assert.equal(writes().length, 0);
	});

	it('refuses when a block gained a child', async () => {
		const pageId = await page([HUMAN, { ...AI, children: [{ id: 'c', type: 'paragraph', content: 'kid' }] }]);
		assert.deepEqual(await undo(await blocksRow(pageId)), { ok: false, code: 'changed_since' });
		assert.equal(writes().length, 0);
	});

	it('a version race (409 between read and PATCH) is changed_since and writes nothing', async () => {
		const pageId = await page([HUMAN, AI]);
		bridge.onPatch = () => {
			const stored = bridge.pageContent(pageId);
			if (stored) stored.version = (stored.version ?? 0) + 1;
		};
		const approval = await blocksRow(pageId);
		assert.deepEqual(await undo(approval), { ok: false, code: 'changed_since' });
		bridge.onPatch = undefined;
		assert.equal(writes().length, 1, 'one PATCH, refused; no second write');
		assert.deepEqual(bridge.pageContent(pageId)?.content, [HUMAN, AI]);
		// The refusal released the claim: the retry can go.
		assert.deepEqual(await undo((await getOwnedApproval(app.db, { id: approval.id, ownerId: USER_A }))!), { ok: true });
	});

	it('a page with no contentVersion is not_undoable and nothing is sent', async () => {
		const pageId = await page([HUMAN, AI]);
		bridge.seedPage(pageId, [HUMAN, AI], null);
		const approval = await blocksRow(pageId);
		assert.deepEqual(await undo(approval), { ok: false, code: 'not_undoable' });
		assert.equal(writes().length, 0);
		const row = await getOwnedApproval(app.db, { id: approval.id, ownerId: USER_A });
		assert.equal((row!.result as { undoneAt?: unknown }).undoneAt, undefined);
	});

	it('a second undo is already_undone', async () => {
		const pageId = await page([HUMAN, AI]);
		const approval = await blocksRow(pageId);
		assert.deepEqual(await undo(approval), { ok: true });
		const again = await getOwnedApproval(app.db, { id: approval.id, ownerId: USER_A });
		assert.deepEqual(await undo(again!), { ok: false, code: 'already_undone' });
	});

	it('a failed bridge write releases the claim', async () => {
		const pageId = await page([HUMAN, AI]);
		const approval = await blocksRow(pageId);
		bridge.failNextWith(500, 1);
		assert.deepEqual(await undo(approval), { ok: false, code: 'failed' });
		const row = await getOwnedApproval(app.db, { id: approval.id, ownerId: USER_A });
		assert.equal((row!.result as { undoneAt?: unknown }).undoneAt, undefined);
	});
});

describe('rename_page and create_page undo', () => {
	it('rename_page puts the previous title back', async () => {
		const pageId = await page([], 'New name');
		const approval = await executed('rename_page', { pageId, title: 'New name' }, { pageId, previousTitle: 'Old name', appliedTitle: 'New name' });
		assert.deepEqual(await undo(approval), { ok: true });
		assert.equal(bridge.pageContent(pageId)?.title, 'Old name');
	});

	it('rename_page applied with an empty title still matches the bridge\'s Untitled', async () => {
		const pageId = await page([], '');
		const approval = await executed('rename_page', { pageId, title: '' }, { pageId, previousTitle: 'Old name', appliedTitle: '' });
		assert.deepEqual(await undo(approval), { ok: true });
		assert.equal(bridge.pageContent(pageId)?.title, 'Old name');
	});

	it('rename_page applied as "Untitled" matches too', async () => {
		const pageId = await page([], 'Untitled');
		const approval = await executed('rename_page', { pageId, title: 'Untitled' }, { pageId, previousTitle: 'Old name', appliedTitle: 'Untitled' });
		assert.deepEqual(await undo(approval), { ok: true });
	});

	it('rename_page refuses when the title changed since', async () => {
		const pageId = await page([], 'Human title');
		const approval = await executed('rename_page', { pageId, title: 'New name' }, { pageId, previousTitle: 'Old name', appliedTitle: 'New name' });
		assert.deepEqual(await undo(approval), { ok: false, code: 'changed_since' });
		assert.equal(writes().length, 0);
	});

	it('create_page archives the created page', async () => {
		const pageId = await page([], 'Made by AI');
		const approval = await executed('create_page', { title: 'Made by AI' }, { createdPageId: pageId, parentPageId: null });
		assert.deepEqual(await undo(approval), { ok: true });
		assert.ok(bridge.pageContent(pageId)?.archivedAt);
	});

	it('create_page refuses when the page has a human child', async () => {
		const pageId = await page([], 'Made by AI');
		await page([], 'Human child', pageId);
		const approval = await executed('create_page', { title: 'Made by AI' }, { createdPageId: pageId, parentPageId: null });
		assert.deepEqual(await undo(approval), { ok: false, code: 'changed_since' });
		assert.equal(writes().length, 0);
	});

	it('create_page ignores a child another AI row of the same turn created', async () => {
		const parent = await page([], 'Made by AI');
		const child = await page([], 'AI child', parent);
		await executed('create_page', { title: 'AI child' }, { createdPageId: child, parentPageId: parent });
		const approval = await executed('create_page', { title: 'Made by AI' }, { createdPageId: parent, parentPageId: null });
		assert.deepEqual(await undo(approval), { ok: true });
	});
});

describe('add_blocks undo against a JSONB page', () => {
	it('still undoes a block whose content keys the database stores in another order', async () => {
		const rich = { id: 'rich', type: 'paragraph', content: { text: 'hi', marks: [], align: 'left', z: 1 } };
		const pageId = await page([HUMAN, rich]);
		const row = await executed('add_blocks', { pageId }, { pageId, version: 3, blocks: [recordedBlock(rich)], summary: 's' });
		assert.deepEqual(await undo(row), { ok: true });
		assert.deepEqual(bridge.pageContent(pageId)?.content, [HUMAN]);
	});
});

describe('a lost answer to the undo write', () => {
	it('add_blocks: the write landed, so the claim is kept and the undo is ok', async () => {
		const pageId = await page([HUMAN, AI]);
		const approval = await blocksRow(pageId);
		bridge.dropNextPatchAnswers(1, { apply: true });
		assert.deepEqual(await undo(approval), { ok: true });
		const row = await getOwnedApproval(app.db, { id: approval.id, ownerId: USER_A });
		assert.ok((row!.result as { undoneAt?: unknown }).undoneAt, 'the claim stays');
		assert.deepEqual(bridge.pageContent(pageId)?.content, [HUMAN]);
	});

	it('add_blocks: the write did not land, so the claim is released', async () => {
		const pageId = await page([HUMAN, AI]);
		const approval = await blocksRow(pageId);
		bridge.dropNextPatchAnswers(1, { apply: false });
		assert.deepEqual(await undo(approval), { ok: false, code: 'failed' });
		const row = await getOwnedApproval(app.db, { id: approval.id, ownerId: USER_A });
		assert.equal((row!.result as { undoneAt?: unknown }).undoneAt, undefined);
		assert.deepEqual(await undo(row!), { ok: true });
	});

	it('rename_page: the write landed, so the claim is kept', async () => {
		const pageId = await page([], 'New name');
		const approval = await executed('rename_page', { pageId, title: 'New name' }, { pageId, previousTitle: 'Old name', appliedTitle: 'New name' });
		bridge.dropNextPatchAnswers(1, { apply: true });
		assert.deepEqual(await undo(approval), { ok: true });
		const row = await getOwnedApproval(app.db, { id: approval.id, ownerId: USER_A });
		assert.ok((row!.result as { undoneAt?: unknown }).undoneAt);
	});

	it('create_page: the archive landed, so the claim is kept', async () => {
		const pageId = await page([], 'Made by AI');
		const approval = await executed('create_page', { title: 'Made by AI' }, { createdPageId: pageId, parentPageId: null });
		bridge.dropNextPatchAnswers(1, { apply: true });
		assert.deepEqual(await undo(approval), { ok: true });
		const row = await getOwnedApproval(app.db, { id: approval.id, ownerId: USER_A });
		assert.ok((row!.result as { undoneAt?: unknown }).undoneAt);
	});
});

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
		run = await aRun();
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
		run = await aRun();
		const pageId = await page([HUMAN, AI], 'T');
		const first = await executed('rename_page', { pageId, title: 'T' }, { pageId, previousTitle: 'Before', appliedTitle: 'T' });
		const second = await executed('add_blocks', { pageId }, { pageId, version: 3, blocks: [recordedBlock(AI)], summary: 's' });
		const made = await page([], 'Made');
		const third = await executed('create_page', { title: 'Made' }, { createdPageId: made, parentPageId: null });
		await app.db.query(`update public.ai_approvals set created_at = now() - interval '3 minutes' where id = $1`, [first.id]);
		await app.db.query(`update public.ai_approvals set created_at = now() - interval '2 minutes' where id = $1`, [second.id]);
		await app.db.query(`update public.ai_approvals set created_at = now() - interval '1 minutes' where id = $1`, [third.id]);
		const answer = await post(run.runId);
		const body = answer.body as { results: { approvalId: string; ok: boolean; code?: string }[] };
		assert.equal(answer.status, 200);
		assert.deepEqual(body.results.map((r) => r.approvalId), [third.id, second.id, first.id]);
		assert.ok(body.results.every((r) => r.ok));
		assert.deepEqual(writes().map((c) => Object.keys(c.body as object).sort()), [['archivedAt'], ['baseVersion', 'content'], ['title']]);
	});

	it('stops at the first refusal and says which row', async () => {
		run = await aRun();
		const pageId = await page([HUMAN, AI], 'Other');
		const older = await executed('rename_page', { pageId, title: 'Other' }, { pageId, previousTitle: 'Before', appliedTitle: 'Other' });
		const newer = await blocksRow(pageId);
		await app.db.query(`update public.ai_approvals set created_at = now() - interval '2 minutes' where id = $1`, [older.id]);
		bridge.pageContent(pageId)!.content = [HUMAN];
		const fresh = await call(`/api/ai/runs/${run.runId}/undo-writes`, { method: 'POST', token: TOKEN, body: {} });
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
		run = await aRun();
		const first = run;
		const pageId = await page([HUMAN, AI], 'Turn');
		const a = await blocksRow(pageId);
		const continuation = await aRun();
		const turn = await app.db.query('select turn_id from public.ai_runs where id = $1', [first.runId]);
		await app.db.query('update public.ai_runs set turn_id = $2 where id = $1', [continuation.runId, turn.rows[0].turn_id ?? first.runId]);
		await app.db.query('update public.ai_runs set turn_id = $2 where id = $1', [first.runId, turn.rows[0].turn_id ?? first.runId]);
		const otherPage = await page([HUMAN, AI], 'Turn2');
		run = continuation;
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
		run = await aRun();
		const pageId = await page([HUMAN, AI]);
		const row = await blocksRow(pageId);
		const answer = await post(row.id);
		assert.equal(answer.status, 200);
		assert.deepEqual(bridge.pageContent(pageId)?.content, [HUMAN]);
	});

	it('answers not_undoable for an archive_page row', async () => {
		run = await aRun();
		const row = await executed('archive_page', { pageId: randomUUID() }, {});
		const answer = await post(row.id);
		assert.equal(answer.status, 409);
		assert.equal((answer.body as { code?: string }).code, 'not_undoable');
	});
});

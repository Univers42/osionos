import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { startHarness, USER_A, WORKSPACE_A } from './harness.ts';
import { SseStream, collect } from './sse.ts';

/**
 * The apply core: a human decision records WHAT the write did (the ids it
 * minted, the title it replaced, the page it created), and who decided.
 */
const { app, bridge, mock, postRun, tokenFor, createConversation, call } = await startHarness();
const { blockDigest } = await import('../src/approvals/inverseData.ts');
const { unclaimAuto } = await import('../src/approvals/claim.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

async function page(title: string, content: unknown[] = []): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, content)
		 values ($1, $2, $3, $4, 'shared', $5::jsonb)`,
		[id, WORKSPACE_A, USER_A, title, JSON.stringify(content)],
	);
	bridge.seedPage(id, content, 3);
	return id;
}

async function ask(tool: string, args: Record<string, unknown>): Promise<string> {
	mock.setOptions({
		preDelayMs: 0, chunkCount: 2, chunkGapMs: 0, fail: false,
		toolCall: { name: tool, arguments: args },
		toolCallTrigger: 'do it', toolCallEveryStep: false, parallelToolCalls: 1, usage: null,
	});
	const conversationId = await createConversation();
	const events = await collect(new SseStream(await postRun(conversationId, randomUUID(), 'do it')));
	const asked = events.filter((event) => event.event === 'permission.asked');
	assert.equal(asked.length, 1, 'the run asked once');
	return String((asked[0].data as { approvalId: string }).approvalId);
}

async function decideRow(approvalId: string) {
	const answer = await call(`/api/ai/approvals/${approvalId}`, {
		method: 'POST',
		token: tokenFor(USER_A, WORKSPACE_A),
		body: { decision: 'approve' },
	});
	assert.equal(answer.status, 200);
	const row = await app.db.query('select status, result, error, decided_by from public.ai_approvals where id = $1', [approvalId]);
	return row.rows[0];
}

describe('the apply core records what a human-approved write did', () => {
	before(async () => {
		await app.db.query('delete from public.ai_approvals');
		bridge.reset();
	});

	it('add_blocks: the minted ids, their place and their digest', async () => {
		const pageId = await page('Notes', [{ id: 'b1', type: 'paragraph', content: 'x' }]);
		const approvalId = await ask('add_blocks', {
			pageId,
			blocks: [{ type: 'paragraph', content: 'one' }, { type: 'heading_1', content: 'two' }],
		});
		const row = await decideRow(approvalId);
		assert.equal(row.status, 'executed');
		assert.equal(row.decided_by, 'user');
		assert.equal(row.result.tool, 'add_blocks');
		const sent = (bridge.ofMethod('POST').find((c) => c.path === `/api/pages/${pageId}/blocks`)?.body as { blocks: { id: string; type: string; content: string }[] }).blocks;
		assert.deepEqual(
			row.result.blocks,
			sent.map((b, index) => ({ id: b.id, parentId: null, index, sha256: blockDigest(b) })),
		);
		assert.equal(row.result.blocks[0].sha256, createHash('sha256').update(JSON.stringify(['paragraph', 'one'])).digest('hex'));
	});

	it('rename_page: the title read before the PATCH', async () => {
		const pageId = await page('Old name');
		const row = await decideRow(await ask('rename_page', { pageId, title: 'New name' }));
		assert.equal(row.status, 'executed');
		assert.equal(row.decided_by, 'user');
		assert.equal(row.result.tool, 'rename_page');
		assert.equal(row.result.previousTitle, 'Old name');
		assert.equal(row.result.appliedTitle, 'New name');
	});

	it('create_page: the id the bridge answered with', async () => {
		const row = await decideRow(await ask('create_page', { title: 'Fresh', workspaceId: WORKSPACE_A }));
		assert.equal(row.status, 'executed');
		assert.equal(row.decided_by, 'user');
		assert.equal(row.result.tool, 'create_page');
		assert.match(row.result.createdPageId, /^[0-9a-f-]{36}$/);
		assert.equal(row.result.createdPageId, row.result.pageId, 'the same id the answer carried');
		assert.equal(row.result.parentPageId, null);
	});

	it('unclaimAuto puts an auto claim back to pending, never a human one', async () => {
		const pageId = await page('P');
		const id = await ask('archive_page', { pageId });
		const claim = (by: string) =>
			app.db.query(`update public.ai_approvals set status = 'executing', decided_by = $2, decided_at = now() where id = $1`, [id, by]);
		await claim('user');
		assert.equal(await unclaimAuto(app.db, id), false);
		await claim('auto:auto');
		assert.equal(await unclaimAuto(app.db, id), true);
		const row = await app.db.query('select status, decided_by, decided_at from public.ai_approvals where id = $1', [id]);
		assert.deepEqual(row.rows[0], { status: 'pending', decided_by: null, decided_at: null });
	});
});

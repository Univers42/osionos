import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach } from 'node:test';
import { SseStream, collect } from './sse.ts';

/**
 * The shared set-up of the applied-write undo tests (undoApplied*.test.ts): one
 * harness per test file, a run the rows name, and the row and page builders.
 */
// The undo routes are behind the flag (I1): this file runs them with it on.
process.env.OSIONOS_AI_MODES = 'on';
process.env.OSIONOS_AI_MODES_USERS = '33333333-3333-4333-8333-333333333333';
const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');
export { USER_A, WORKSPACE_A };
const { app, bridge, mock, postRun, tokenFor, createConversation, call } = await startHarness();
export { app, bridge, call };
const { undoApplied } = await import('../src/approvals/undoApplied.ts');
const { blockDigest } = await import('../src/approvals/inverseData.ts');
const { getOwnedApproval } = await import('../src/approvals/repo.ts');
export { getOwnedApproval };

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

export const TOKEN = tokenFor(USER_A, WORKSPACE_A);
export const AI = { id: 'ai1', type: 'paragraph', content: 'ai text' };
export const HUMAN = { id: 'h1', type: 'paragraph', content: 'mine' };

/** A run, so that rows can name one. */
export async function aRun(): Promise<{ runId: string; conversationId: string }> {
	const conversationId = await createConversation();
	await collect(new SseStream(await postRun(conversationId, randomUUID(), 'do it')));
	const row = await app.db.query('select id as run_id from public.ai_runs where conversation_id = $1 limit 1', [conversationId]);
	return { runId: row.rows[0].run_id, conversationId };
}

/** The run new rows name; a test that needs a fresh one assigns `ctx.run`. */
export const ctx = { run: await aRun() };

beforeEach(() => bridge.reset());

export async function page(content: unknown[], title = 'Notes', parent: string | null = null): Promise<string> {
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
export async function executed(tool: string, args: Record<string, unknown>, result: Record<string, unknown>, ageDays = 0, mcpTokenId: string | null = null) {
	const id = randomUUID();
	await app.db.query(
		`insert into public.ai_approvals
		   (id, origin, token_id, run_id, conversation_id, owner_id, workspace_id, tool, args, args_sha256, status, result, decided_by, created_at, decided_at, expires_at)
		 values ($1, $11, $12::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8, 'executed', $9::jsonb, 'auto:auto',
		         now() - ($10::int * interval '1 day'), now() - ($10::int * interval '1 day'), now() + interval '10 minutes')`,
		[id, mcpTokenId ? null : ctx.run.runId, mcpTokenId ? null : ctx.run.conversationId, USER_A, WORKSPACE_A, tool, JSON.stringify(args), id, JSON.stringify({ ok: true, tool, ...result }), ageDays, mcpTokenId ? 'mcp' : 'run', mcpTokenId],
	);
	const row = await getOwnedApproval(app.db, { id, ownerId: USER_A });
	assert.ok(row);
	return row;
}

export const undo = async (approval: Awaited<ReturnType<typeof executed>>) =>
	undoApplied({ db: app.db, bridgeUrl: bridge.baseUrl, sessionToken: TOKEN, approval });

export const recordedBlock = (block: { id: string; type: string; content: unknown }) => ({ id: block.id, parentId: null, index: 0, sha256: blockDigest(block) });

export async function blocksRow(pageId: string, ageDays = 0) {
	return executed('add_blocks', { pageId }, { pageId, version: 3, blocks: [recordedBlock(AI)], summary: 's' }, ageDays);
}

export const writes = () => bridge.calls.filter((c) => c.method !== 'GET');

/**
 * The shared set-up of the auto verdict and auto apply tests (autoDecide*.test.ts):
 * one harness per test file with the modes on for USER_A, and the kit and row builders.
 */
import { randomUUID } from 'node:crypto';
import { after } from 'node:test';
import type { AuthUser } from '../src/auth.ts';
import type { ApprovalRow } from '../src/approvals/types.ts';
import type { AutoGate } from '../src/modes/autoGate.ts';
import type { StoredMode } from '../src/modes/mode.ts';

export const USER_A = '11111111-1111-4111-8111-111111111111';
export const USER_B = '22222222-2222-4222-8222-222222222222';
process.env.OSIONOS_AI_MODES = 'on';
process.env.OSIONOS_AI_MODES_USERS = USER_A;
process.env.OSIONOS_AI_AUTO_PER_TURN = '2';
process.env.OSIONOS_AI_AUTO_PER_MINUTE = '3';

const { startHarness, WORKSPACE_A, WORKSPACE_B } = await import('./harness.ts');
const { app, mock, bridge, createConversation } = await startHarness();
export { app, bridge, WORKSPACE_A, WORKSPACE_B };
const { autoVerdict } = await import('../src/approvals/autoVerdict.ts');
const { autoDecide } = await import('../src/approvals/autoDecide.ts');
const { makeRunCredential } = await import('../src/modes/credential.ts');
const { makeWriteBudget } = await import('../src/modes/writeBudget.ts');
const { makeAppendCoalescer } = await import('../src/approvals/appendCoalescer.ts');
const { makeStepCounter, checkAutoWriteRate } = await import('../src/modes/autoLimits.ts');
const { writeConversationMode } = await import('../src/modes/mode.ts');
const { config } = await import('../src/config.ts');
export { autoVerdict, autoDecide, makeRunCredential, makeWriteBudget, makeStepCounter, checkAutoWriteRate, config };

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

export const user: AuthUser = { userId: USER_A, workspaceId: WORKSPACE_A, memberWorkspaces: [], isAdmin: false, issuedAtMs: Date.now(), expiresAtMs: null };
export const AUTO: StoredMode = { mode: 'auto', anchorPageId: null };

export async function page(workspaceId = WORKSPACE_A, parent: string | null = null): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, parent_page_id, content)
		 values ($1, $2, $3, 't', 'private', $4, '[]'::jsonb)`,
		[id, workspaceId, USER_A, parent],
	);
	bridge.seedPage(id, [], 1);
	return id;
}

export interface Kit { gate: AutoGate; conversationId: string; runId: string; turnId: string }

/** A run row, a conversation holding `live`, and a gate whose snapshot is `snapshot`. */
export async function kit(snapshot: StoredMode = AUTO, live: StoredMode = snapshot, over: Partial<AutoGate> = {}): Promise<Kit> {
	const conversationId = await createConversation();
	await writeConversationMode(app.db, conversationId, USER_A, live);
	const runId = randomUUID();
	const turnId = randomUUID();
	await app.db.query(
		`insert into public.ai_runs (id, conversation_id, owner_id, status, model, turn_id) values ($1, $2, $3, 'running', 'm', $4)`,
		[runId, conversationId, USER_A, turnId],
	);
	const gate: AutoGate = {
		db: app.db, redis: app.redis, user, conversationId, workspaceId: WORKSPACE_A, runId, turnId,
		snapshot: { ...snapshot, runKind: 'request' },
		credential: makeRunCredential('the-session-token', Date.now() + 3_600_000),
		budget: makeWriteBudget({ startedAtMs: Date.now(), totalMs: 120_000, signal: new AbortController().signal }),
		step: makeStepCounter(10),
		coalescer: makeAppendCoalescer(),
		reads: new Set(),
		...over,
	};
	return { gate, conversationId, runId, turnId };
}

export async function row(k: Kit, tool: string, args: Record<string, unknown>): Promise<ApprovalRow> {
	const id = randomUUID();
	const inserted = await app.db.query<ApprovalRow>(
		`insert into public.ai_approvals (id, owner_id, workspace_id, tool, args, args_sha256, status, origin, conversation_id, run_id, expires_at)
		 values ($1, $2, $3, $4, $5::jsonb, $6, 'pending', 'run', $7, $8, now() + interval '10 minutes') returning *`,
		[id, USER_A, WORKSPACE_A, tool, JSON.stringify(args), `ad-${id}`, k.conversationId, k.runId],
	);
	return inserted.rows[0];
}

/**
 * The rate window is the wall-clock minute and the day key the UTC date: a case
 * that fills one and then asks must not straddle a boundary, so it waits one out
 * when fewer than 5 s remain (a minute boundary includes midnight).
 */
export async function awayFromMinuteBoundary(): Promise<void> {
	const left = 60_000 - (Date.now() % 60_000);
	if (left < 5_000) await new Promise<void>((resolve) => setTimeout(resolve, left + 50));
}

export const append = (pageId: string): Record<string, unknown> => ({ pageId, blocks: [{ type: 'paragraph', content: 'x' }] });
export const reasonOf = async (k: Kit, r: ApprovalRow): Promise<string> => {
	const verdict = await autoVerdict(k.gate, r, Date.now());
	return verdict.kind === 'card' ? verdict.reason : verdict.decidedBy;
};

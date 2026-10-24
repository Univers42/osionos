import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { startHarness, USER_A, USER_B, WORKSPACE_A } from './harness.ts';
import { SseStream, collect } from './sse.ts';
import type { SseEvent } from './sse.ts';

/**
 * The decision of an approval: the one moment a write happens.
 *
 * Exactly one write, with the token of the request that decided; the outcome
 * recorded before anything else; a continuation that is a run of its own; and
 * a foreign approval that does not exist for the caller.
 */
const { app, bridge, mock, postRun, tokenFor, createConversation, call } = await startHarness();
const { sweepApprovals } = await import('../src/approvals/repo.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

/** The events of a type. */
function eventsOf(events: SseEvent[], type: string): SseEvent[] {
	return events.filter((event) => event.event === type);
}

/** A page of the workspace of the caller. */
async function page(title = 'The notes'): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, content)
		 values ($1, $2, $3, $4, 'shared', '[]'::jsonb)`,
		[id, WORKSPACE_A, USER_A, title],
	);
	return id;
}

/** A run in which the model asks for a write: the id of the approval. */
async function ask(
	tool: string,
	args: Record<string, unknown>,
	model?: string,
): Promise<{ approvalId: string; conversationId: string }> {
	mock.setOptions({
		preDelayMs: 0,
		chunkCount: 2,
		chunkGapMs: 0,
		fail: false,
		toolCall: { name: tool, arguments: args },
		toolCallTrigger: 'do it',
		toolCallEveryStep: false,
		parallelToolCalls: 1,
		usage: null,
	});
	const conversationId = await createConversation();
	const events = await collect(new SseStream(await postRun(conversationId, randomUUID(), 'do it', model)));
	const asked = eventsOf(events, 'permission.asked');
	assert.equal(asked.length, 1, 'the run asked once');
	return {
		approvalId: String((asked[0].data as { approvalId: string }).approvalId),
		conversationId,
	};
}

/** The decision of an approval. */
function decide(
	approvalId: string,
	decision: string,
	token = tokenFor(USER_A, WORKSPACE_A),
): Promise<{ status: number; body: Record<string, unknown> | null }> {
	return call(`/api/ai/approvals/${approvalId}`, { method: 'POST', token, body: { decision } });
}

describe('the decision of an approval', () => {
	before(async () => {
		await app.db.query('delete from public.ai_conversations');
		await app.db.query('delete from public.ai_usage_daily');
		await app.db.query('delete from public.ai_approvals');
		bridge.reset();
	});

	it('the run that asks ends, and the approval row is what waits (C5)', async () => {
		const { approvalId } = await ask('create_page', { title: 'The report', workspaceId: WORKSPACE_A });
		const runs = await app.db.query(
			`select status, finish_reason from public.ai_runs where id = (select run_id from public.ai_approvals where id = $1)`,
			[approvalId],
		);
		assert.equal(runs.rows[0].status, 'succeeded', 'the run is terminal');
		assert.equal(runs.rows[0].finish_reason, 'awaiting_approval');
		const row = await app.db.query('select status from public.ai_approvals where id = $1', [approvalId]);
		assert.equal(row.rows[0].status, 'pending', 'the approval row carries the state');
		// The sweep of the stale runs leaves it alone: it is not running.
		const { sweepStaleRuns } = await import('../src/runs/runner.ts');
		await sweepStaleRuns(app.db, 0);
		const after = await app.db.query(
			`select status from public.ai_runs where id = (select run_id from public.ai_approvals where id = $1)`,
			[approvalId],
		);
		assert.equal(after.rows[0].status, 'succeeded', 'the run was not swept to failed');
	});

	it('the approval is readable by its owner, and by nobody else (C6)', async () => {
		const { approvalId } = await ask('create_page', { title: 'Readable', workspaceId: WORKSPACE_A });
		const mine = await call(`/api/ai/approvals/${approvalId}`, { token: tokenFor(USER_A, WORKSPACE_A) });
		assert.equal(mine.status, 200);
		assert.equal((mine.body as { tool: string }).tool, 'create_page');
		assert.deepEqual((mine.body as { args: unknown }).args, { workspaceId: WORKSPACE_A, title: 'Readable' });
		const foreign = await call(`/api/ai/approvals/${approvalId}`, { token: tokenFor(USER_B, WORKSPACE_A) });
		assert.equal(foreign.status, 404, 'a foreign approval does not exist');
	});

	it('approving writes once, with the token of the request (C7, C10)', async () => {
		bridge.reset();
		const { approvalId } = await ask('create_page', { title: 'Once', workspaceId: WORKSPACE_A });
		const token = tokenFor(USER_A, WORKSPACE_A);
		const answer = await decide(approvalId, 'approve', token);
		assert.equal(answer.status, 200);
		assert.equal((answer.body as { status: string }).status, 'executed');
		const writes = bridge.ofMethod('POST');
		assert.equal(writes.length, 1, 'exactly one write');
		assert.equal(writes[0].authorization, `Bearer ${token}`, 'the token of the request went with it');
		const body = writes[0].body as Record<string, unknown>;
		assert.equal(body.title, 'Once');
		assert.equal(body.visibility, undefined, 'no sharing key reaches the bridge');
		const row = await app.db.query('select status, result from public.ai_approvals where id = $1', [approvalId]);
		assert.equal(row.rows[0].status, 'executed', 'the outcome is recorded');
	});

	it('two decisions that race write once, and only once (C7)', async () => {
		bridge.reset();
		const { approvalId } = await ask('create_page', { title: 'Race', workspaceId: WORKSPACE_A });
		const [first, second] = await Promise.all([
			decide(approvalId, 'approve'),
			decide(approvalId, 'approve'),
		]);
		const statuses = [first.status, second.status].sort();
		assert.deepEqual(statuses, [200, 409], 'one decision wins, the other is refused');
		assert.equal(bridge.ofMethod('POST').length, 1, 'the write landed once');
	});

	it('the crash between the write and the outcome is closed by the sweep (C7)', async () => {
		bridge.reset();
		const { approvalId } = await ask('create_page', { title: 'Crash', workspaceId: WORKSPACE_A });
		// The process died after the claim: the row is 'executing', and nobody
		// ever recorded the outcome.
		await app.db.query(
			`update public.ai_approvals set status = 'executing', decided_at = now() - interval '10 minutes' where id = $1`,
			[approvalId],
		);
		await sweepApprovals(app.db, { now: new Date() });
		const row = await app.db.query('select status, error from public.ai_approvals where id = $1', [approvalId]);
		assert.equal(row.rows[0].status, 'unknown', 'the write MAY have happened');
		assert.match(String(row.rows[0].error), /may have executed/);
		const answer = await decide(approvalId, 'approve');
		assert.equal(answer.status, 409, 'the row is never decided twice');
		assert.equal(bridge.count, 0, 'nothing was written');
	});

	it('declining writes nothing, and says so (C7)', async () => {
		bridge.reset();
		const { approvalId } = await ask('archive_page', { pageId: await page() });
		const answer = await decide(approvalId, 'decline');
		assert.equal(answer.status, 200);
		assert.equal((answer.body as { status: string }).status, 'declined');
		assert.equal(bridge.count, 0, 'a decline never writes');
		const row = await app.db.query('select status from public.ai_approvals where id = $1', [approvalId]);
		assert.equal(row.rows[0].status, 'declined');
	});

	it('the archive that is approved is a stamp (C2)', async () => {
		bridge.reset();
		const pageId = await page('To archive');
		const childId = randomUUID();
		await app.db.query(
			`insert into public.osionos_pages (id, workspace_id, owner_id, parent_page_id, title, visibility, content)
			 values ($1, $2, $3, $4, 'The child', 'shared', '[]'::jsonb)`,
			[childId, WORKSPACE_A, USER_A, pageId],
		);
		const { approvalId } = await ask('archive_page', { pageId });
		const answer = await decide(approvalId, 'approve');
		assert.equal(answer.status, 200);
		const writes = bridge.ofMethod('PATCH');
		assert.equal(writes.length, 1, 'one write');
		assert.equal(bridge.ofMethod('DELETE').length, 0, 'a delete is never reachable');
		const body = writes[0].body as Record<string, unknown>;
		assert.ok(typeof body.archivedAt === 'string', 'the archive is a stamp');
		assert.equal(body.title, undefined, 'the archive changes nothing else');
		const children = await app.db.query('select id from public.osionos_pages where id = $1', [childId]);
		assert.equal(children.rows.length, 1, 'the child is still there');
	});

	it('a foreign approval cannot be decided', async () => {
		const { approvalId } = await ask('create_page', { title: 'Foreign', workspaceId: WORKSPACE_A });
		const answer = await decide(approvalId, 'approve', tokenFor(USER_B, WORKSPACE_A));
		assert.equal(answer.status, 404);
	});

	it('the body of a decision is the decision, and nothing else (C14)', async () => {
		const { approvalId } = await ask('create_page', { title: 'Body', workspaceId: WORKSPACE_A });
		const wrong = await call(`/api/ai/approvals/${approvalId}`, {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
			body: { decision: 'maybe' },
		});
		assert.equal(wrong.status, 400);
		const extra = await call(`/api/ai/approvals/${approvalId}`, {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
			body: { decision: 'approve', args: { title: 'hijacked' } },
		});
		assert.equal(extra.status, 400, 'a body that carries more than a decision is refused');
		const row = await app.db.query('select status from public.ai_approvals where id = $1', [approvalId]);
		assert.equal(row.rows[0].status, 'pending', 'nothing happened');
	});

	it('an expired approval is not decided (C14)', async () => {
		const { approvalId } = await ask('create_page', { title: 'Expired', workspaceId: WORKSPACE_A });
		await app.db.query('update public.ai_approvals set expires_at = now() - interval \'1 minute\' where id = $1', [
			approvalId,
		]);
		const answer = await decide(approvalId, 'approve');
		assert.equal(answer.status, 409);
		const row = await app.db.query('select status from public.ai_approvals where id = $1', [approvalId]);
		assert.equal(row.rows[0].status, 'expired');
	});

	it('the continuation is a run of its own, with its own reservation (C5, C13)', async () => {
		bridge.reset();
		const { approvalId, conversationId } = await ask(
			'create_page',
			{ title: 'Continue', workspaceId: WORKSPACE_A },
			'mock-metered',
		);
		const answer = await decide(approvalId, 'approve');
		assert.equal(answer.status, 200);
		const continuationRunId = String((answer.body as { continuationRunId: string | null }).continuationRunId);
		assert.ok(continuationRunId, 'the continuation started');
		const runs = await app.db.query(
			'select id, reserved_microusd, status from public.ai_runs where conversation_id = $1 order by created_at',
			[conversationId],
		);
		assert.equal(runs.rows.length, 2, 'the conversation carries two runs');
		const continuation = runs.rows.find((row) => String(row.id) === continuationRunId);
		assert.ok(continuation, 'the continuation is its own row');
		assert.ok(Number(continuation.reserved_microusd) > 0, 'the continuation reserved its own money');
		assert.notEqual(String(runs.rows[0].id), String(runs.rows[1].id));
	});

	it('a decided approval is deleted after its retention (C14)', async () => {
		const { approvalId } = await ask('create_page', { title: 'Old', workspaceId: WORKSPACE_A });
		await app.db.query(
			`update public.ai_approvals set status = 'executed', decided_at = now() - interval '8 days' where id = $1`,
			[approvalId],
		);
		await sweepApprovals(app.db, { now: new Date() });
		const row = await app.db.query('select id from public.ai_approvals where id = $1', [approvalId]);
		assert.equal(row.rows.length, 0, 'the row is gone');
	});
});

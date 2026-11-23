import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';

/** The mode snapshot of a run (AM13), AM10 done-when, and the turn id of a continuation. */
const USER_ALLOWED = '11111111-1111-4111-8111-111111111111';
process.env.OSIONOS_AI_MODES = 'on';
process.env.OSIONOS_AI_MODES_USERS = USER_ALLOWED;

const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');
const { effectiveMode } = await import('../src/modes/effectiveMode.ts');
const { makeRunCredential } = await import('../src/modes/credential.ts');
const { writeConversationMode } = await import('../src/modes/mode.ts');
const { continueRun } = await import('../src/approvals/continuation.ts');
const { app, mock, bridge, call, postRun, tokenFor, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const user = {
	userId: USER_A,
	workspaceId: WORKSPACE_A,
	memberWorkspaces: [{ id: WORKSPACE_A, role: 'owner' }],
	isAdmin: false,
	issuedAtMs: Date.now(),
	expiresAtMs: Date.now() + 3_600_000,
};
const credential = makeRunCredential('tok', user.expiresAtMs);

async function autoConversation(title: string): Promise<string> {
	const id = await createConversation(title);
	await writeConversationMode(app.db, id, USER_A, { mode: 'auto', anchorPageId: null });
	return id;
}

describe('effectiveMode', () => {
	it('is auto for a request with a credential', async () => {
		const id = await autoConversation('k1');
		const snap = await effectiveMode(app.db, { user, conversationId: id, runKind: 'request', credential });
		assert.deepEqual(snap, { mode: 'auto', anchorPageId: null, runKind: 'request' });
	});

	it('is auto for a decided continuation with a credential', async () => {
		const id = await autoConversation('k2');
		assert.equal((await effectiveMode(app.db, { user, conversationId: id, runKind: 'decided', credential })).mode, 'auto');
	});

	it('is manual for a thread run', async () => {
		const id = await autoConversation('k3');
		assert.equal((await effectiveMode(app.db, { user, conversationId: id, runKind: 'thread', credential })).mode, 'manual');
	});

	it('is manual for a continuation without a credential', async () => {
		const id = await autoConversation('k4');
		assert.equal((await effectiveMode(app.db, { user, conversationId: id, runKind: 'continuation', credential: null })).mode, 'manual');
		assert.equal((await effectiveMode(app.db, { user, conversationId: id, runKind: 'request', credential: null })).mode, 'manual');
	});

	it('is manual for a user off the allowlist, a scoped token and no user', async () => {
		const id = await autoConversation('k5');
		const other = { ...user, userId: '33333333-3333-4333-8333-333333333333' };
		assert.equal((await effectiveMode(app.db, { user: other, conversationId: id, runKind: 'request', credential })).mode, 'manual');
		const scoped = { ...user, scope: [WORKSPACE_A] };
		assert.equal((await effectiveMode(app.db, { user: scoped, conversationId: id, runKind: 'request', credential })).mode, 'manual');
		assert.equal((await effectiveMode(app.db, { user: null, conversationId: id, runKind: 'request', credential })).mode, 'manual');
	});

	it('is manual for a conversation the user does not own or none', async () => {
		assert.equal((await effectiveMode(app.db, { user, conversationId: randomUUID(), runKind: 'request', credential })).mode, 'manual');
		assert.equal((await effectiveMode(app.db, { user, conversationId: null, runKind: 'request', credential })).mode, 'manual');
	});
});

describe('run routes', () => {
	it('POST /runs refuses mode auto in the body', async () => {
		const id = await autoConversation('k6');
		const res = await call('/api/ai/runs', { method: 'POST', token: tokenFor(USER_A, WORKSPACE_A), body: { runId: randomUUID(), conversationId: id, text: 'hi', mode: 'auto' } });
		assert.equal(res.status, 400);
	});

	it('a manual conversation gets no auto decision row', async () => {
		const id = await createConversation('k7');
		const res = await call('/api/ai/runs', { method: 'POST', token: tokenFor(USER_A, WORKSPACE_A), body: { runId: randomUUID(), conversationId: id, text: 'hi' } });
		assert.equal(res.status, 200);
		const rows = await app.db.query("select 1 from public.ai_approvals where conversation_id = $1 and decided_by like 'auto:%'", [id]);
		assert.equal(rows.rowCount, 0);
	});
});

describe('mode read failure', () => {
	it('falls back to manual, completes the run and leaves no running row', async () => {
		const id = await autoConversation('k9');
		const original = app.db.query.bind(app.db);
		(app.db as { query: unknown }).query = (text: unknown, ...rest: unknown[]) =>
			typeof text === 'string' && text.includes('assist_mode')
				? Promise.reject(Object.assign(new Error('boom'), { code: 'XX000' }))
				: (original as (...a: unknown[]) => unknown)(text, ...rest);
		try {
			const snap = await effectiveMode(app.db, { user, conversationId: id, runKind: 'request', credential });
			assert.equal(snap.mode, 'manual');
			const res = await call('/api/ai/runs', { method: 'POST', token: tokenFor(USER_A, WORKSPACE_A), body: { runId: randomUUID(), conversationId: id, text: 'hi' } });
			assert.equal(res.status, 200);
		} finally {
			(app.db as { query: unknown }).query = original;
		}
		const running = await app.db.query("select 1 from public.ai_runs where conversation_id = $1 and status = 'running'", [id]);
		assert.equal(running.rowCount, 0);
	});
});

describe('decided continuation', () => {
	it('inherits the turn id of the run that asked', async () => {
		const conversationId = await createConversation('k8');
		const parent = randomUUID();
		const turn = randomUUID();
		await (await postRun(conversationId, parent, 'hi')).text();
		await app.db.query('update public.ai_runs set turn_id = $2 where id = $1', [parent, turn]);
		const row = { id: randomUUID(), origin: 'run', run_id: parent, conversation_id: conversationId, owner_id: USER_A, tool: 'create_page' };
		const runId = await continueRun(app.db, app.redis, user, row as never, 'declined', '', credential);
		assert.ok(runId);
		const child = await app.db.query('select turn_id from public.ai_runs where id = $1', [runId]);
		assert.equal(child.rows[0].turn_id, turn);
	});
});

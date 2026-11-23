/**
 * Auto writes through a real run (AM4, AM10, AM11, AM12, AM13, AM18, AM20): the
 * model asks, the service applies with the caller's own token, the run goes on.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { SseStream, collect } from './sse.ts';
import type { SseEvent } from './sse.ts';

const USER_ALLOWED = '11111111-1111-4111-8111-111111111111';
process.env.OSIONOS_AI_MODES = 'on';
process.env.OSIONOS_AI_MODES_USERS = USER_ALLOWED;

const { startHarness, USER_A, WORKSPACE_A, WORKSPACE_B } = await import('./harness.ts');
const { app, mock, bridge, call, postRun, tokenFor, createConversation } = await startHarness();
const { effectiveMode } = await import('../src/modes/effectiveMode.ts');
const { makeRunCredential } = await import('../src/modes/credential.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const token = tokenFor(USER_A, WORKSPACE_A);
const patchMode = (id: string, body: unknown) => call(`/api/ai/conversations/${id}/mode`, { method: 'PATCH', token, body });

async function page(workspaceId = WORKSPACE_A, parent: string | null = null): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, parent_page_id, content)
		 values ($1, $2, $3, 't', 'private', $4, '[]'::jsonb)`,
		[id, workspaceId, USER_A, parent],
	);
	bridge.seedPage(id, [], 1);
	return id;
}

const add = (pageId: string, text: string) => ({ name: 'add_blocks', arguments: { pageId, blocks: [{ type: 'paragraph', content: text }] } });

function script(steps: Array<{ name: string; arguments: Record<string, unknown> }>, beforeStep: ((step: number) => Promise<void>) | null = null): void {
	mock.setOptions({
		preDelayMs: 0, chunkCount: 2, chunkGapMs: 0, fail: false, toolCall: null, toolCallTrigger: null,
		toolCallEveryStep: false, parallelToolCalls: 1, usage: null, beforeStep, toolCallScript: steps,
	});
}

async function run(conversationId: string, authToken = token): Promise<SseEvent[]> {
	return collect(new SseStream(await postRun(conversationId, randomUUID(), 'do it', undefined, authToken)));
}

const rowsOf = async (conversationId: string) =>
	(await app.db.query('select tool, status, decided_by from public.ai_approvals where conversation_id = $1 order by created_at', [conversationId])).rows;
const askedReasons = (events: SseEvent[]): unknown[] =>
	events.filter((e) => e.event === 'permission.asked').map((e) => (e.data as { cardReason?: string }).cardReason);

describe('auto writes in a run', () => {
	beforeEach(() => {
		bridge.reset();
		mock.setOptions({ beforeStep: null, toolCallScript: null });
	});

	it('two add_blocks in auto reach step 3 with both results Applied (AM4) and the caller token (AM20)', async () => {
		const [a, b] = [await page(), await page()];
		const id = await createConversation();
		assert.equal((await patchMode(id, { mode: 'auto' })).status, 200);
		const before = mock.bodies.length;
		script([add(a, 'one'), add(b, 'two')]);
		const events = await run(id);
		assert.equal(askedReasons(events).length, 0, 'no card');
		assert.equal(events.filter((e) => e.event === 'write.applied').length, 2);
		const done = events.find((e) => e.event === 'done');
		assert.ok(done && !JSON.stringify(done.data).includes('awaiting_approval'));
		assert.equal(mock.bodies.length - before, 3, 'three model steps');
		assert.equal((JSON.stringify(mock.bodies[mock.bodies.length - 1]).match(/Applied:/g) ?? []).length, 2);
		assert.deepEqual(await rowsOf(id), [
			{ tool: 'add_blocks', status: 'executed', decided_by: 'auto:auto' },
			{ tool: 'add_blocks', status: 'executed', decided_by: 'auto:auto' },
		]);
		assert.equal(bridge.calls.length, 2);
		for (const c of bridge.calls) assert.equal(c.authorization, `Bearer ${token}`);
	});

	it('narrowing to manual between steps cards the second write; widening changes nothing (AM10)', async () => {
		const [a, b] = [await page(), await page()];
		const id = await createConversation();
		await patchMode(id, { mode: 'auto' });
		script([add(a, 'one'), add(b, 'two')], async (step) => {
			if (step === 2) await patchMode(id, { mode: 'manual' });
		});
		const events = await run(id);
		assert.deepEqual(askedReasons(events), ['mode_manual']);
		assert.deepEqual((await rowsOf(id)).map((r) => r.status), ['executed', 'pending']);

		const widen = await createConversation();
		await patchMode(widen, { mode: 'manual' });
		script([add(a, 'x')], async (step) => {
			if (step === 1) await patchMode(widen, { mode: 'auto' });
		});
		assert.deepEqual(askedReasons(await run(widen)), ['mode_manual']);
	});

	it('a page moved out of the anchor mid-run gives outside_anchor (AM11)', async () => {
		const anchor = await page();
		const child = await page(WORKSPACE_A, anchor);
		const id = await createConversation();
		assert.equal((await patchMode(id, { mode: 'accept_edits', anchorPageId: anchor })).status, 200);
		script([add(child, 'in'), add(child, 'again')], async (step) => {
			if (step === 2) await app.db.query('update public.osionos_pages set parent_page_id = null where id = $1', [child]);
		});
		const events = await run(id);
		assert.deepEqual(askedReasons(events), ['outside_anchor']);
		assert.deepEqual((await rowsOf(id)).map((r) => [r.status, r.decided_by]), [['executed', 'auto:accept_edits'], ['pending', null]]);
	});

	it('a card tells the model to say so and stop, and the run makes no further tool step', async () => {
		const id = await createConversation();
		script([add(await page(), 'x')]);
		const before = mock.bodies.length;
		await run(id);
		const last = JSON.stringify(mock.bodies[mock.bodies.length - 1]);
		assert.ok(/Sent to the user for approval \(this conversation asks the user[^)]*\): say so and stop\./.test(last), 'card sentence ends with the stop instruction');
		assert.equal(mock.bodies.length - before, 2, 'one step to ask, one to answer');
		assert.equal((await rowsOf(id)).length, 1, 'no second write');
	});

	it('a create_page whose parent is in another workspace is a card, never applied (AM12)', async () => {
		const foreign = await page(WORKSPACE_B);
		const id = await createConversation();
		await patchMode(id, { mode: 'auto' });
		script([{ name: 'create_page', arguments: { title: 'x', workspaceId: WORKSPACE_A, parentPageId: foreign } }]);
		const events = await run(id);
		assert.equal(bridge.calls.length, 0);
		const rows = await rowsOf(id);
		assert.ok(rows.every((r) => r.status !== 'executed'), JSON.stringify(rows));
		if (rows.length > 0) assert.deepEqual(askedReasons(events), ['outside_workspace']);
	});

	it('a token that expires in 20 s gives credential_expiring', async () => {
		const short = signAppSessionToken({
			payload: { subject: USER_A, provider: 'test' },
			workspace: { _id: WORKSPACE_A },
			config: { appSessionSecret: process.env.OSIONOS_APP_SESSION_SECRET ?? '', sessionTtlSeconds: 20 },
		}).token;
		const id = await createConversation();
		await patchMode(id, { mode: 'auto' });
		script([add(await page(), 'x')]);
		assert.deepEqual(askedReasons(await run(id, short)), ['credential_expiring']);
		assert.equal(bridge.calls.length, 0);
	});

	it('a bridge 401 leaves the row pending as credential_rejected after exactly one call', async () => {
		const id = await createConversation();
		await patchMode(id, { mode: 'auto' });
		script([add(await page(), 'x')]);
		bridge.failWith = 401;
		try {
			assert.deepEqual(askedReasons(await run(id)), ['credential_rejected']);
		} finally {
			bridge.failWith = 0;
		}
		assert.equal(bridge.calls.length, 1);
		assert.deepEqual(await rowsOf(id), [{ tool: 'add_blocks', status: 'pending', decided_by: null }]);
	});

	it('a user off the allowlist with a stored auto mode gets mode_manual (AM18)', async () => {
		const stranger = randomUUID();
		const tokenB = tokenFor(stranger, WORKSPACE_A);
		const id = await createConversation('b', tokenB);
		await app.db.query("update public.ai_conversations set assist_mode = 'auto' where id = $1", [id]);
		const target = randomUUID();
		await app.db.query(
			'insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions) values ($1, $2, $3, $4) on conflict do nothing',
			[WORKSPACE_A, stranger, 'member', ['read', 'write']],
		);
		await app.db.query(
			`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, content) values ($1, $2, $3, 't', 'shared', '[]'::jsonb)`,
			[target, WORKSPACE_A, stranger],
		);
		script([add(target, 'x')]);
		assert.deepEqual(askedReasons(await run(id, tokenB)), ['mode_manual']);
		assert.equal(bridge.calls.length, 0);
	});

	it('a thread run, an osio-bot run and a continuation without a credential stay manual (AM1, AM13)', async () => {
		const id = await createConversation();
		await patchMode(id, { mode: 'auto' });
		const user = { userId: USER_A, workspaceId: WORKSPACE_A, memberWorkspaces: [], isAdmin: false, issuedAtMs: Date.now(), expiresAtMs: null };
		const credential = makeRunCredential('t', Date.now() + 3_600_000);
		const kinds = [
			{ user, conversationId: id, runKind: 'thread' as const, credential },
			{ user, conversationId: id, runKind: 'continuation' as const, credential: null },
			{ user: { ...user, scope: { kind: 'bot' } } as never, conversationId: id, runKind: 'request' as const, credential },
		];
		for (const input of kinds) assert.equal((await effectiveMode(app.db, input)).mode, 'manual');
		assert.equal((await effectiveMode(app.db, { user, conversationId: id, runKind: 'request', credential })).mode, 'auto');
	});
});

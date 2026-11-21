import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { startFailingUpstream } from './mockFailing.ts';
import { FREE, FREE_TIER_FIRST, startHarness, USER_A, WORKSPACE_A } from './harness.ts';
import { SseStream, collect } from './sse.ts';

/**
 * FA26: a run on a may-train model sends no workspace data, in this turn or
 * in replayed turns. The upstream body is captured, not the internals.
 */
const upstream = await startFailingUpstream();
const MAY_TRAIN = FREE_TIER_FIRST.id;
const NO_TRAIN = FREE.id;
const { app, mock, base, tokenFor, createConversation, postComplete, call } = await startHarness({
	upstreamBaseUrl: upstream.baseUrl,
	openRouterModels: [{ id: MAY_TRAIN, dataUse: 'may-train' }],
});

after(async () => {
	await app.close();
	await mock.close();
	await upstream.close();
});
before(() => upstream.reset());

const PAGE_SECRET = 'PAGE-SECRET-TEXT-4711';
/** A no-train answer that paraphrased the page: no tag, no mark, nothing a scrubber can find. */
const PROSE_SUMMARY = 'The Q3 plan targets Acme Corp at a 40M valuation; the board signs on 12 Dec.';

/** An earlier turn that cited a page: its stored answer carries the quoted source and a mark. */
async function citedConversation(): Promise<string> {
	const conversationId = await createConversation();
	const runId = randomUUID();
	await app.db.query(
		`insert into public.ai_runs (id, conversation_id, owner_id, status, model) values ($1, $2, $3, 'succeeded', 'm')`,
		[runId, conversationId, USER_A],
	);
	const rows: [string, string][] = [
		['user', 'what does the plan say?'],
		['assistant', `<source n="1" page="p" title="Plan">${PAGE_SECRET}</source> The plan says go [1].`],
		['user', 'summarise it'],
		['assistant', PROSE_SUMMARY],
	];
	for (const [role, text] of rows) {
		await app.db.query(
			`insert into public.ai_messages (conversation_id, run_id, role, parts) values ($1, $2, $3, $4::jsonb)`,
			[conversationId, runId, role, JSON.stringify([{ type: 'text', text }])],
		);
	}
	return conversationId;
}

const CONTINUATION_SECRET = 'CONTINUATION-SECRET-9001';
const LEGACY_SECRET = 'LEGACY-CONTINUATION-SECRET-9002';

async function seedTurn(conversationId: string, role: string, text: string): Promise<void> {
	await app.db.query(
		`insert into public.ai_messages (conversation_id, role, parts) values ($1, $2, $3::jsonb)`,
		[conversationId, role, JSON.stringify([{ type: 'text', text }])],
	);
}

/** A continuation turn written by the runner itself, as an approval decision starts it. */
async function continuationTurn(conversationId: string, text: string): Promise<void> {
	const { startRun } = await import('../src/runs/runner.ts');
	const { resolveTarget } = await import('../src/gateway/resolve.ts');
	const resolved = await resolveTarget(app.db, app.redis, { userId: USER_A } as never, undefined, NO_TRAIN);
	if (resolved.kind === 'refused') throw new Error('no target');
	const started = await startRun({
		db: app.db, redis: app.redis, runId: randomUUID(), conversationId, ownerId: USER_A,
		text, target: resolved.target, emit: () => undefined, continuation: true,
	} as never);
	assert.equal(started.kind, 'started');
	if (started.kind === 'started') await started.execute();
}

/** A pending approval of a run whose model now resolves to {@link MAY_TRAIN}. */
async function mayTrainApproval(conversationId: string): Promise<string> {
	const runId = randomUUID();
	const approvalId = randomUUID();
	await app.db.query(
		`insert into public.ai_runs (id, conversation_id, owner_id, status, model) values ($1, $2, $3, 'succeeded', $4)`,
		[runId, conversationId, USER_A, MAY_TRAIN],
	);
	await app.db.query(
		`insert into public.ai_approvals (id, owner_id, workspace_id, tool, args, args_sha256, status, origin, conversation_id, run_id, expires_at)
		 values ($1, $2, $3, 'create_page', $4::jsonb, $5, 'pending', 'run', $6, $7, now() + interval '10 minutes')`,
		[approvalId, USER_A, WORKSPACE_A, JSON.stringify({ title: CONTINUATION_SECRET }), `mt-${approvalId}`, conversationId, runId],
	);
	return approvalId;
}

async function post(conversationId: string, model: string, extra: object = {}): Promise<Response> {
	return fetch(`${base}/api/ai/runs`, {
		method: 'POST',
		headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`, 'content-type': 'application/json' },
		body: JSON.stringify({ runId: randomUUID(), conversationId, text: 'and now?', model, ...extra }),
	});
}

async function finished(response: Response): Promise<void> {
	assert.equal(response.status, 200);
	await collect(new SseStream(response));
}

describe('a may-train run carries no workspace data', () => {
	it('refuses a body with pageIds, attachments or the workspace search: 400 may_train_context', async () => {
		const conversationId = await createConversation();
		const bodies = [
			{ context: { pageIds: [randomUUID()] } },
			{ context: { workspace: true } },
			{ attachments: [{ kind: 'chat', id: randomUUID() }] },
		];
		for (const extra of bodies) {
			const response = await post(conversationId, MAY_TRAIN, extra);
			assert.equal(response.status, 400);
			assert.equal(((await response.json()) as { code: string }).code, 'may_train_context');
		}
		assert.equal(upstream.countFor(MAY_TRAIN), 0);
	});

	it('R37: replays no earlier answer, only the user turns: a no-train summary of a page stays out', async () => {
		await finished(await post(await citedConversation(), MAY_TRAIN));
		// The system prompt names the <source> tag; only the replayed turns are read.
		const sent = (upstream.bodiesFor(MAY_TRAIN)[0] as { messages: { role: string }[] }).messages;
		const replayed = sent.filter((message) => message.role !== 'system').slice(0, -1);
		const raw = JSON.stringify(replayed);
		assert.ok(raw.includes('what does the plan say?'), 'the user turn is replayed');
		assert.deepEqual(replayed.map((message) => message.role), ['user', 'user']);
		assert.equal(raw.includes(PAGE_SECRET), false);
		assert.equal(raw.includes(PROSE_SUMMARY), false, 'a plain-prose summary of the page is not replayed');
	});

	it('refuses an inline completion on a may-train model: 400 may_train_context, no upstream call', async () => {
		const calls = upstream.countFor(MAY_TRAIN);
		const response = await postComplete({
			runId: randomUUID(), command: 'summarize', input: { text: PAGE_SECRET }, model: MAY_TRAIN,
		});
		assert.equal(response.status, 400);
		assert.equal(((await response.json()) as { code: string }).code, 'may_train_context');
		assert.equal(upstream.countFor(MAY_TRAIN), calls);
	});

	it('exposes no page tools', async () => {
		await finished(await post(await createConversation(), MAY_TRAIN));
		const body = upstream.bodiesFor(MAY_TRAIN).at(-1) as { tools?: { function: { name: string } }[] };
		const names = (body.tools ?? []).map((tool) => tool.function.name);
		assert.deepEqual(names.filter((name) => !name.startsWith('web_')), []);
	});

	it('a no-train run is unchanged: history, tools', async () => {
		await finished(await post(await citedConversation(), NO_TRAIN));
		const body = upstream.bodiesFor(NO_TRAIN)[0] as { tools?: { function: { name: string } }[] };
		assert.ok(JSON.stringify(body).includes(PAGE_SECRET));
		assert.ok((body.tools ?? []).some((tool) => tool.function.name === 'read_page'));
	});

	it('sends no open-page or tab title, and no workspace name', async () => {
		await app.db.query(
			`insert into public.osionos_workspaces (id, owner_id, name) values ($1, $2, 'WS-NAME-SECRET')
			 on conflict (id) do update set name = excluded.name`,
			[WORKSPACE_A, USER_A],
		);
		const view = {
			route: '/p', layout: 'single', panel: 'files',
			activePage: { id: randomUUID(), title: 'ACTIVE-TITLE-SECRET' },
			tabs: [{ title: 'TAB-TITLE-SECRET', kind: 'page' }],
		};
		await finished(await post(await createConversation(), MAY_TRAIN, { context: { view, account: true } }));
		const sent = JSON.stringify(upstream.bodiesFor(MAY_TRAIN).at(-1));
		for (const secret of ['ACTIVE-TITLE-SECRET', 'TAB-TITLE-SECRET', 'WS-NAME-SECRET']) {
			assert.equal(sent.includes(secret), false, secret);
		}
		assert.ok(sent.includes('panel='), 'the view block itself is still sent');
		assert.ok(sent.includes('<account'), 'the account block itself is still sent');
		await finished(await post(await createConversation(), NO_TRAIN, { context: { view, account: true } }));
		assert.ok(JSON.stringify(upstream.bodiesFor(NO_TRAIN).at(-1)).includes('WS-NAME-SECRET'), 'no-train keeps it');
	});

	it('R37: replays no approval continuation, marked or written before the mark; typed turns stay', async () => {
		const conversationId = await createConversation();
		await seedTurn(conversationId, 'user', 'TYPED-OWN-WORDS-1');
		await seedTurn(conversationId, 'user', `the user approved create_page (create), result: ${LEGACY_SECRET}`);
		await continuationTurn(conversationId, `MCP output ${CONTINUATION_SECRET}`);
		await finished(await post(conversationId, MAY_TRAIN));
		const sent = JSON.stringify(upstream.bodiesFor(MAY_TRAIN).at(-1));
		assert.ok(sent.includes('TYPED-OWN-WORDS-1'), 'the typed turn is replayed');
		assert.equal(sent.includes(CONTINUATION_SECRET), false, 'a marked continuation is not replayed');
		assert.equal(sent.includes(LEGACY_SECRET), false, 'an unmarked continuation of an older row is not replayed');
		await finished(await post(conversationId, NO_TRAIN));
		const noTrain = JSON.stringify(upstream.bodiesFor(NO_TRAIN).at(-1));
		assert.ok(noTrain.includes(CONTINUATION_SECRET) && noTrain.includes(LEGACY_SECRET), 'no-train keeps the continuations');
	});

	it('R37: a decision on a run whose model is now may-train starts no continuation', async () => {
		const conversationId = await createConversation();
		const calls = upstream.countFor(MAY_TRAIN);
		const decided = await call(`/api/ai/approvals/${await mayTrainApproval(conversationId)}`, {
			method: 'POST', token: tokenFor(USER_A, WORKSPACE_A), body: { decision: 'decline' },
		});
		assert.equal(decided.status, 200, 'the decision itself succeeds');
		assert.equal(decided.body?.status, 'declined');
		assert.equal(decided.body?.continuationRunId, null, 'no continuation run starts');
		const runs = await app.db.query('select count(*)::int as n from public.ai_runs where conversation_id = $1', [conversationId]);
		assert.equal(runs.rows[0].n, 1, 'only the run that asked');
		assert.equal(upstream.countFor(MAY_TRAIN), calls, 'no upstream request reaches the may-train model');
	});
});

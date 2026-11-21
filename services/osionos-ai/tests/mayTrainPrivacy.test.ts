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
const { app, mock, base, tokenFor, createConversation } = await startHarness({
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
	];
	for (const [role, text] of rows) {
		await app.db.query(
			`insert into public.ai_messages (conversation_id, run_id, role, parts) values ($1, $2, $3, $4::jsonb)`,
			[conversationId, runId, role, JSON.stringify([{ type: 'text', text }])],
		);
	}
	return conversationId;
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

	it('strips the quoted page and its citation mark from replayed turns', async () => {
		await finished(await post(await citedConversation(), MAY_TRAIN));
		// The system prompt names the <source> tag; only the replayed turns are read.
		const sent = (upstream.bodiesFor(MAY_TRAIN)[0] as { messages: { role: string }[] }).messages;
		const raw = JSON.stringify(sent.filter((message) => message.role !== 'system').slice(0, -1));
		assert.ok(raw.includes('what does the plan say?'), 'the replayed turns are in the body');
		assert.equal(raw.includes(PAGE_SECRET), false);
		assert.equal(raw.includes('<source'), false);
		assert.equal(raw.includes('[1]'), false);
		assert.ok(raw.includes('The plan says go'), 'the rest of the answer is kept');
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
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { SseStream, collect } from './sse.ts';

/**
 * User hooks when the deployment has not turned them on (C1121): rows of kind
 * 'hook' in the table are never read, by a run or by an approve, and the run
 * offers the tools of today. Anything but the exact word `on` is off.
 */
const { startHarness, USER_A, WORKSPACE_A } = await (async () => {
	process.env.OSIONOS_AI_USER_HOOKS = 'ON';
	delete process.env.OSIONOS_AI_USER_CONTEXT;
	delete process.env.OSIONOS_AI_USER_COMMANDS;
	return import('./harness.ts');
})();
const { app, mock, bridge, call, tokenFor, createConversation, postRun } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

function offeredTools(): string[] {
	const tools = (mock.lastBody() as { tools?: { function?: { name: string }; name?: string }[] }).tools ?? [];
	return tools.map((tool) => tool.function?.name ?? tool.name ?? '').sort();
}

/** Counts the queries that read hooks while `work` runs. */
async function hookQueriesDuring(work: () => Promise<void>): Promise<number> {
	const db = app.db as unknown as { query: (...args: unknown[]) => unknown };
	const query = db.query;
	let reads = 0;
	db.query = (...args: unknown[]) => {
		if (String(args[0]).includes("kind = 'hook'")) reads += 1;
		return query.apply(app.db, args);
	};
	try {
		await work();
	} finally {
		db.query = query;
	}
	return reads;
}

describe('C1121 user hooks are off unless the flag is exactly on', () => {
	it('a run and an approve never read the hook rows, and the tools are those of today', async () => {
		await app.db.query('delete from public.ai_context_items');
		await app.db.query('delete from public.ai_approvals');
		bridge.reset();
		mock.setOptions({ preDelayMs: 0, chunkCount: 2, chunkGapMs: 0, fail: false, toolCall: null });
		await collect(new SseStream(await postRun(await createConversation(), randomUUID(), 'hello')));
		const before = offeredTools();
		await app.db.query(
			`insert into public.ai_context_items (kind, scope, owner_id, slug, name, description, body, created_by, updated_by)
			 values ('hook', 'user', $1, 'no-pages', 'n', 'd', E'create_page\\nread_page', $1, $1)`,
			[USER_A],
		);
		const runReads = await hookQueriesDuring(async () => {
			await collect(new SseStream(await postRun(await createConversation(), randomUUID(), 'hello')));
		});
		assert.equal(runReads, 0);
		assert.deepEqual(offeredTools(), before);
		assert.ok(before.includes('create_page'));

		mock.setOptions({
			toolCall: { name: 'create_page', arguments: { title: 'The report', workspaceId: WORKSPACE_A } },
			toolCallTrigger: 'do it',
			toolCallEveryStep: false,
			parallelToolCalls: 1,
			usage: null,
		});
		const events = await collect(new SseStream(await postRun(await createConversation(), randomUUID(), 'do it')));
		const asked = events.find((event) => event.event === 'permission.asked');
		assert.ok(asked, 'the run asked');
		const approvalId = String((asked.data as { approvalId: string }).approvalId);
		let status = 0;
		const approveReads = await hookQueriesDuring(async () => {
			status = (await call(`/api/ai/approvals/${approvalId}`, { method: 'POST', token: tokenFor(USER_A, WORKSPACE_A), body: { decision: 'approve' } })).status;
		});
		assert.equal(approveReads, 0);
		assert.equal(status, 200);
		assert.ok(bridge.count > 0, 'the write went out');
	});

	it('the routes refuse the hook kind', async () => {
		const answer = await call('/api/ai/context/items', {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
			body: { kind: 'hook', slug: 'h', name: 'n', description: 'd', body: 'create_page' },
		});
		assert.equal(answer.status, 404);
	});
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { SseStream, collect } from './sse.ts';
import type { SseEvent } from './sse.ts';

/**
 * The builder plan, proposed and stored (devil P6 C150-C153, C160, C163,
 * C164.1 and C164.8). Nothing here executes a plan: that is P6a-3.
 */
process.env.OSIONOS_AI_BUILDERS = 'on';
// This file asks many plans and keeps them waiting on purpose: the C161 limits
// have their own file (builderUndo.test.ts).
process.env.OSIONOS_AI_PENDING_PLANS = '100';
process.env.OSIONOS_AI_BUILDS_PER_DAY = '100';
const { startHarness, USER_A, WORKSPACE_A, WORKSPACE_B } = await import('./harness.ts');
const { app, bridge, mock, postRun, tokenFor, createConversation, call } = await startHarness();
// The service reads its config on import: after the harness set the environment.
const { revalidateStoredPlan } = await import('../src/builders/plan.ts');
const { writeTools } = await import('../src/tools/writeToolList.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

type Json = Record<string, unknown>;

/** A plan within the caps: a page holding a database and a sub-page. */
function goodPlan(patch: Json = {}): Json {
	return {
		workspaceId: WORKSPACE_A,
		title: 'Sales workspace',
		items: [
			{
				kind: 'page',
				key: 'home',
				title: 'Home',
				blocks: [
					{ type: 'heading_1', content: 'Welcome' },
					{ type: 'database_inline', databaseKey: 'deals' },
				],
				children: [{ kind: 'page', key: 'notes', title: 'Notes' }],
			},
			{
				kind: 'database',
				key: 'deals',
				title: 'Deals',
				properties: [
					{ name: 'Name', type: 'title' },
					{ name: 'Stage', type: 'status', options: ['Open', 'Won'] },
				],
				views: [{ type: 'table', name: 'All' }],
				rows: [{ values: { Name: 'Acme', Stage: 'Open' } }],
			},
		],
		...patch,
	};
}

/** The plan with one database changed. */
function withDatabase(patch: Json): Json {
	const plan = goodPlan() as { items: Json[] };
	plan.items[1] = { ...plan.items[1], ...patch };
	return plan;
}

/** The plan with one extra root page. */
function withPage(patch: Json): Json {
	const plan = goodPlan() as { items: Json[] };
	plan.items.push({ kind: 'page', key: 'extra', title: 'Extra', ...patch });
	return plan;
}

/** The events of a run in which the model calls build_plan. */
async function ask(args: Json): Promise<SseEvent[]> {
	mock.setOptions({
		preDelayMs: 0,
		chunkCount: 2,
		chunkGapMs: 0,
		fail: false,
		toolCall: { name: 'build_plan', arguments: args },
		toolCallTrigger: 'do it',
		toolCallEveryStep: false,
		parallelToolCalls: 1,
		usage: null,
	});
	const conversationId = await createConversation();
	return collect(new SseStream(await postRun(conversationId, randomUUID(), 'do it')));
}

/** The permission.asked events. */
function asked(events: SseEvent[]): SseEvent[] {
	return events.filter((event) => event.event === 'permission.asked');
}

/** The number of the build_plan approvals. */
async function rowCount(): Promise<number> {
	const result = await app.db.query(`select count(*)::int as n from public.ai_approvals where tool = 'build_plan'`);
	return Number(result.rows[0].n);
}

/** Proposes the plan and asserts that it is refused with no row. */
async function assertRefused(args: Json, label: string): Promise<void> {
	const before = await rowCount();
	const events = await ask(args);
	assert.equal(asked(events).length, 0, `${label}: no question reaches the user`);
	assert.equal(await rowCount(), before, `${label}: no row`);
}

describe('the builder plan', () => {
	before(async () => {
		await app.db.query('delete from public.ai_conversations');
		await app.db.query('delete from public.ai_usage_daily');
		await app.db.query('delete from public.ai_approvals');
		bridge.reset();
	});

	it('C151 a plan within the caps is stored as one approval', async () => {
		const events = await ask(goodPlan());
		const event = asked(events);
		assert.equal(event.length, 1);
		const data = event[0].data as { approvalId: string; preview: Json };
		assert.deepEqual(data.preview, { unit: 'items', count: 3 });
		const rows = await app.db.query(`select tool, args from public.ai_approvals where id = $1`, [data.approvalId]);
		assert.equal(rows.rows[0].tool, 'build_plan');
		const stored = rows.rows[0].args as { items: Json[] };
		const home = stored.items[0] as { id: string; children: { id: string }[] };
		assert.match(home.id, /^[0-9a-f-]{36}$/);
		assert.match(home.children[0].id, /^[0-9a-f-]{36}$/);
		assert.match(String(stored.items[1].dbKey), /^db-[0-9a-f]{24}$/);
		assert.equal(revalidateStoredPlan(stored).ok, true);
	});

	it('C151 41 items, depth 4, a duplicate key, a dangling databaseKey, a row naming no property, two title properties', async () => {
		const many = Array.from({ length: 41 }, (_, i) => ({ kind: 'page', key: `p${i}`, title: `P${i}` }));
		await assertRefused(goodPlan({ items: many }), '41 items');
		const deep = {
			kind: 'page', key: 'a', title: 'A',
			children: [{ kind: 'page', key: 'b', title: 'B', children: [{ kind: 'page', key: 'c', title: 'C', children: [{ kind: 'page', key: 'd', title: 'D' }] }] }],
		};
		await assertRefused(goodPlan({ items: [deep] }), 'depth 4');
		await assertRefused(withPage({ key: 'home' }), 'duplicate key');
		await assertRefused(withPage({ blocks: [{ type: 'database_full_page', databaseKey: 'nowhere' }] }), 'dangling databaseKey');
		await assertRefused(withDatabase({ rows: [{ values: { Missing: 'x' } }] }), 'row naming no property');
		await assertRefused(
			withDatabase({ rows: [], properties: [{ name: 'A', type: 'title' }, { name: 'B', type: 'title' }] }),
			'two title properties',
		);
	});

	it('C152 a formula, relation, rollup, button, person or files_media property is refused', async () => {
		for (const type of ['formula', 'relation', 'rollup', 'button', 'person', 'files_media']) {
			await assertRefused(
				withDatabase({ rows: [], properties: [{ name: 'Name', type: 'title' }, { name: 'X', type, buttonConfig: { actions: [{ type: 'webhook' }] } }] }),
				type,
			);
		}
	});

	it('C151 a board without a select or status property, a calendar without a date property, and a chart are refused', async () => {
		const title = { name: 'Name', type: 'title' };
		await assertRefused(withDatabase({ rows: [], properties: [title], views: [{ type: 'board', name: 'Board' }] }), 'board');
		await assertRefused(withDatabase({ rows: [], properties: [title], views: [{ type: 'calendar', name: 'Cal' }] }), 'calendar');
		await assertRefused(withDatabase({ views: [{ type: 'chart', name: 'Chart' }] }), 'chart');
	});

	it('C151 a board with a select property and a calendar with a date property are stored', async () => {
		const before = await rowCount();
		const properties = [{ name: 'Name', type: 'title' }, { name: 'Stage', type: 'select', options: ['A'] }, { name: 'Due', type: 'date' }];
		const events = await ask(withDatabase({ rows: [], properties, views: [{ type: 'board', name: 'B' }, { type: 'calendar', name: 'C' }] }));
		assert.equal(asked(events).length, 1);
		assert.equal(await rowCount(), before + 1);
	});

	it('C152 a dashboard view is refused', async () => {
		await assertRefused(withDatabase({ views: [{ type: 'dashboard', name: 'Dash' }] }), 'dashboard');
	});

	it('C154 a database_full_page block is refused', async () => {
		await assertRefused(withPage({ blocks: [{ type: 'database_full_page', databaseKey: 'deals' }] }), 'database_full_page');
	});

	it('C154 an unreferenced database is refused', async () => {
		const plan = JSON.parse(JSON.stringify(goodPlan())) as { items: { blocks?: unknown[] }[] };
		plan.items[0].blocks = [{ type: 'heading_1', content: 'Welcome' }];
		await assertRefused(plan, 'unreferenced database');
	});

	it('C153 an image, video, audio or file block is refused', async () => {
		for (const type of ['image', 'video', 'audio', 'file', 'embed']) {
			await assertRefused(withPage({ blocks: [{ type, content: 'https://x' }] }), type);
		}
	});

	it('C151 unknown keys are stripped', async () => {
		const plan = goodPlan() as { items: Json[] };
		plan.items[0] = { ...plan.items[0], blocks: [{ type: 'paragraph', content: 'hi', src: 'https://x' }, { type: 'database_inline', databaseKey: 'deals' }] };
		plan.items[1] = {
			...plan.items[1],
			properties: [{ name: 'Name', type: 'title', buttonConfig: { url: 'https://x' } }],
			rows: [],
		};
		const data = asked(await ask(plan))[0].data as { approvalId: string };
		const row = await app.db.query(`select args from public.ai_approvals where id = $1`, [data.approvalId]);
		const text = JSON.stringify(row.rows[0].args);
		assert.ok(!text.includes('src'), 'no src stored');
		assert.ok(!text.includes('buttonConfig'), 'no buttonConfig stored');
		assert.ok(!text.includes('https://x'));
	});

	it('C164.1 a stored plan tampered with a button property is refused when re-validated', async () => {
		const data = asked(await ask(goodPlan()))[0].data as { approvalId: string };
		const row = await app.db.query(`select args from public.ai_approvals where id = $1`, [data.approvalId]);
		const stored = row.rows[0].args as { items: { properties?: Json[]; blocks?: Json[] }[] };
		assert.equal(revalidateStoredPlan(stored).ok, true);
		const clone = (): typeof stored => JSON.parse(JSON.stringify(stored)) as typeof stored;
		const button = clone();
		button.items[1].properties![1] = { name: 'Go', type: 'button' };
		assert.equal(revalidateStoredPlan(button).ok, false, 'button');
		const image = clone();
		image.items[0].blocks![0] = { type: 'image', content: 'https://x' };
		assert.equal(revalidateStoredPlan(image).ok, false, 'image block');
		const noIds = clone() as { items: Json[] };
		delete noIds.items[1].dbKey;
		assert.equal(revalidateStoredPlan(noIds).ok, false, 'a minted id removed');
	});

	it('C160 a workspace the caller is not a live member of is refused', async () => {
		await assertRefused(goodPlan({ workspaceId: WORKSPACE_B }), 'foreign workspace');
	});

	it('C164.8 a non-member gets no approval row', async () => {
		const before = await rowCount();
		await assertRefused(goodPlan({ workspaceId: randomUUID() }), 'unknown workspace');
		assert.equal(await rowCount(), before);
	});

	it('C163 build_plan is absent when the flag is off and present when it is on', async () => {
		assert.ok(!writeTools(false).some((tool) => tool.name === 'build_plan'));
		assert.ok(writeTools(true).some((tool) => tool.name === 'build_plan'));
		assert.equal(asked(await ask(goodPlan())).length, 1, 'on: the run tool set offers it');
	});

	it('C150 a build_plan approval executes after P6a-3', async () => {
		const data = asked(await ask(goodPlan()))[0].data as { approvalId: string };
		bridge.reset();
		const decided = await call(`/api/ai/approvals/${data.approvalId}`, {
			method: 'POST',
			token: tokenFor(USER_A, WORKSPACE_A),
			body: { decision: 'approve' },
		});
		assert.equal(decided.status, 200);
		assert.equal((decided.body as { status: string }).status, 'executed');
	});
});

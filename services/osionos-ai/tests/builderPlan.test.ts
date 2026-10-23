import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { Json } from './builderHarness.ts';

/**
 * The builder plan, proposed and stored (devil P6 C150-C153, C160, C163,
 * C164.1 and C164.8). Nothing here executes a plan: that is P6a-3.
 */
// The C161 limits have their own file (builderUndo.test.ts); this one asks many
// plans on purpose, so it lifts them out of the way.
process.env.OSIONOS_AI_PENDING_PLANS = '100';
process.env.OSIONOS_AI_BUILDS_PER_DAY = '100';
const { harness, closeBuilderHarness, goodPlan, ask, asked } = await import('./builderHarness.ts');
const { USER_A, WORKSPACE_A, WORKSPACE_B } = await import('./harness.ts');
const { app, bridge, tokenFor, call } = harness;
// The service reads its config on import: after the harness set the environment.
const { revalidateStoredPlan } = await import('../src/builders/plan.ts');
const { checkPlan, planSchema } = await import('../src/builders/planSchema.ts');
const { writeTools } = await import('../src/tools/writeToolList.ts');

after(closeBuilderHarness);

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

/** The number of the build_plan approvals. */
async function rowCount(): Promise<number> {
	const result = await app.db.query(`select count(*)::int as n from public.ai_approvals where tool = 'build_plan'`);
	return Number(result.rows[0].n);
}

/** The first error the rules give a plan: the schema's path, or checkPlan's sentence. */
function firstError(args: Json): string {
	const parsed = planSchema.safeParse(args);
	if (!parsed.success) return `schema: ${parsed.error.issues[0]?.path.join('.')}`;
	return checkPlan(parsed.data) ?? 'none';
}

/**
 * Proposes the plan and asserts that it is refused with no row; with `expected`,
 * that the refusal is that rule's and not an earlier one's.
 */
async function assertRefused(args: Json, label: string, expected?: RegExp): Promise<void> {
	if (expected) assert.match(firstError(args), expected, label);
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

	it('C151 a board without a select or status property, a calendar without a date property are refused', async () => {
		const title = { name: 'Name', type: 'title' };
		await assertRefused(withDatabase({ rows: [], properties: [title], views: [{ type: 'board', name: 'Board' }] }), 'board');
		await assertRefused(withDatabase({ rows: [], properties: [title], views: [{ type: 'calendar', name: 'Cal' }] }), 'calendar');
	});

	it('C151 a chart without xAxis is refused', async () => {
		await assertRefused(withDatabase({ views: [{ type: 'chart', name: 'Chart' }] }), 'chart without xAxis', /^schema: items\.1$/);
	});

	it('C151 a chart with xAxis naming no property is refused', async () => {
		await assertRefused(withDatabase({ rows: [], properties: [{ name: 'Name', type: 'title' }], views: [{ type: 'chart', name: 'Chart', chartType: 'vertical_bar', xAxis: 'Missing' }] }), 'chart unknown xAxis', /unknown xAxis property/);
	});

	it('C151 a chart with xAxis naming a number property is refused', async () => {
		await assertRefused(withDatabase({ rows: [], properties: [{ name: 'Name', type: 'title' }, { name: 'Score', type: 'number' }], views: [{ type: 'chart', name: 'Chart', chartType: 'vertical_bar', xAxis: 'Score' }] }), 'chart xAxis number', /xAxis must be a text, select/);
	});

	it('C151 a chart with sum/average aggregation without yAxis is refused', async () => {
		await assertRefused(withDatabase({ rows: [], properties: [{ name: 'Name', type: 'title' }, { name: 'Cat', type: 'select', options: ['A'] }], views: [{ type: 'chart', name: 'Chart', chartType: 'vertical_bar', xAxis: 'Cat', aggregation: 'sum' }] }), 'chart sum without yAxis', /needs a yAxis for sum/);
		await assertRefused(withDatabase({ rows: [], properties: [{ name: 'Name', type: 'title' }, { name: 'Cat', type: 'select', options: ['A'] }], views: [{ type: 'chart', name: 'Chart', chartType: 'vertical_bar', xAxis: 'Cat', aggregation: 'average' }] }), 'chart average without yAxis', /needs a yAxis for average/);
	});

	it('C151 a chart with sum/average aggregation with non-number yAxis is refused', async () => {
		await assertRefused(withDatabase({ rows: [], properties: [{ name: 'Name', type: 'title' }, { name: 'Cat', type: 'select', options: ['A'] }, { name: 'Txt', type: 'text' }], views: [{ type: 'chart', name: 'Chart', chartType: 'vertical_bar', xAxis: 'Cat', aggregation: 'sum', yAxis: 'Txt' }] }), 'chart sum with text yAxis', /yAxis must be a number property/);
	});

	it('C151 a chart with valid xAxis and count aggregation is stored', async () => {
		const before = await rowCount();
		const properties = [{ name: 'Name', type: 'title' }, { name: 'Stage', type: 'select', options: ['A'] }];
		const events = await ask(withDatabase({ rows: [], properties, views: [{ type: 'chart', name: 'Chart', chartType: 'vertical_bar', xAxis: 'Stage' }] }));
		assert.equal(asked(events).length, 1);
		assert.equal(await rowCount(), before + 1);
	});

	it('C151 a chart with valid xAxis, sum aggregation and number yAxis is stored', async () => {
		const before = await rowCount();
		const properties = [{ name: 'Name', type: 'title' }, { name: 'Cat', type: 'select', options: ['A'] }, { name: 'Val', type: 'number' }];
		const events = await ask(withDatabase({ rows: [], properties, views: [{ type: 'chart', name: 'Chart', chartType: 'vertical_bar', xAxis: 'Cat', aggregation: 'sum', yAxis: 'Val' }] }));
		assert.equal(asked(events).length, 1);
		assert.equal(await rowCount(), before + 1);
	});

	it('C151 a board with a select property and a calendar with a date property are stored', async () => {
		const before = await rowCount();
		const properties = [{ name: 'Name', type: 'title' }, { name: 'Stage', type: 'select', options: ['A'] }, { name: 'Due', type: 'date' }];
		const events = await ask(withDatabase({ rows: [], properties, views: [{ type: 'board', name: 'B' }, { type: 'calendar', name: 'C' }] }));
		assert.equal(asked(events).length, 1);
		assert.equal(await rowCount(), before + 1);
	});

	it('C151 a dashboard with valid cells over same database views is stored', async () => {
		const before = await rowCount();
		const properties = [{ name: 'Name', type: 'title' }, { name: 'Stage', type: 'status', options: ['Open', 'Won'] }, { name: 'Val', type: 'number' }];
		const events = await ask(withDatabase({
			rows: [],
			properties,
			views: [
				{ type: 'table', name: 'All' },
				{ type: 'board', name: 'Board' },
				{ type: 'chart', name: 'Chart', chartType: 'vertical_bar', xAxis: 'Stage' },
				{ type: 'dashboard', name: 'Dash', cells: [
					{ view: 'All' },
					{ view: 'Board', stat: { fn: 'count' } },
					{ view: 'Chart', stat: { fn: 'sum', property: 'Val' } }
				] }
			]
		}));
		assert.equal(asked(events).length, 1);
		assert.equal(await rowCount(), before + 1);
	});

	it('C151 a dashboard without cells is refused', async () => {
		await assertRefused(withDatabase({ views: [{ type: 'dashboard', name: 'Dash', cells: [] }] }), 'dashboard no cells', /^schema: items\.1\.views\.0\.cells$/);
	});

	it('C151 a dashboard with 7 cells is refused', async () => {
		await assertRefused(withDatabase({
			views: [{ type: 'dashboard', name: 'Dash', cells: [
				{ view: 'A' }, { view: 'B' }, { view: 'C' }, { view: 'D' }, { view: 'E' }, { view: 'F' }, { view: 'G' }
			] }]
		}), 'dashboard 7 cells', /^schema: items\.1$/);
	});

	it('C165 a dashboard cell naming a view of another database is refused', async () => {
		const plan = goodPlan() as { items: Json[] };
		plan.items.push({
			kind: 'page',
			key: 'other-page',
			title: 'Other Page',
			blocks: [{ type: 'database_inline', databaseKey: 'other' }],
		});
		plan.items.push({
			kind: 'database',
			key: 'other',
			title: 'Other',
			properties: [{ name: 'Name', type: 'title' }],
			views: [{ type: 'table', name: 'OtherView' }],
			rows: [],
		});
		plan.items[1] = {
			...plan.items[1],
			properties: [{ name: 'Name', type: 'title' }],
			views: [
				{ type: 'table', name: 'All' },
				{ type: 'dashboard', name: 'Dash', cells: [{ view: 'OtherView' }] }
			],
			rows: [],
		};
		await assertRefused(plan, 'dashboard cross-database cell', /references an unknown view "OtherView"/);
	});

	it('C165 a dashboard cell naming a dashboard view is refused', async () => {
		await assertRefused(withDatabase({
			views: [
				{ type: 'table', name: 'All' },
				// One dashboard per database, so the only dashboard a cell can name is its own.
				{ type: 'dashboard', name: 'Dash', cells: [{ view: 'All' }, { view: 'Dash' }] }
			]
		}), 'dashboard cell references dashboard', /references a dashboard view "Dash"/);
	});

	it('C151 two views with the same name in a database is refused', async () => {
		await assertRefused(withDatabase({
			views: [
				{ type: 'table', name: 'All' },
				{ type: 'board', name: 'All' }
			]
		}), 'duplicate view name', /repeats a view name/);
	});

	it('C151 a database with 7 views is refused', async () => {
		await assertRefused(withDatabase({
			properties: [{ name: 'Name', type: 'title' }, { name: 'Stage', type: 'status', options: ['A'] }],
			views: [
				{ type: 'table', name: 'V1' },
				{ type: 'board', name: 'V2' },
				{ type: 'calendar', name: 'V3' },
				{ type: 'list', name: 'V4' },
				{ type: 'gallery', name: 'V5' },
				{ type: 'chart', name: 'V6', chartType: 'vertical_bar', xAxis: 'Stage' },
				{ type: 'dashboard', name: 'V7', cells: [{ view: 'V1' }] }
			]
		}), '7 views', /^schema: items\.1$/);
	});

	it('C151 a database with two dashboards is refused', async () => {
		await assertRefused(withDatabase({
			properties: [{ name: 'Name', type: 'title' }, { name: 'Stage', type: 'status', options: ['A'] }],
			views: [
				{ type: 'table', name: 'All' },
				{ type: 'dashboard', name: 'Dash1', cells: [{ view: 'All' }] },
				{ type: 'dashboard', name: 'Dash2', cells: [{ view: 'All' }] }
			]
		}), 'two dashboards', /holds more than one dashboard/);
	});

	it('C151 a dashboard stat with sum/avg/min/max without property is refused', async () => {
		await assertRefused(withDatabase({
			properties: [{ name: 'Name', type: 'title' }, { name: 'Stage', type: 'status', options: ['A'] }],
			views: [
				{ type: 'table', name: 'All' },
				{ type: 'dashboard', name: 'Dash', cells: [{ view: 'All', stat: { fn: 'sum' } }] }
			]
		}), 'stat sum without property', /stat sum needs a number property/);
	});

	it('C151 a dashboard stat with sum/avg/min/max on non-number property is refused', async () => {
		await assertRefused(withDatabase({
			properties: [{ name: 'Name', type: 'title' }, { name: 'Stage', type: 'status', options: ['A'] }],
			views: [
				{ type: 'table', name: 'All' },
				{ type: 'dashboard', name: 'Dash', cells: [{ view: 'All', stat: { fn: 'sum', property: 'Stage' } }] }
			]
		}), 'stat sum on non-number', /stat sum needs a number property/);
	});

	it('C151 a dashboard stat with count needs no property', async () => {
		const before = await rowCount();
		const events = await ask(withDatabase({
			properties: [{ name: 'Name', type: 'title' }, { name: 'Stage', type: 'status', options: ['A'] }],
			views: [
				{ type: 'table', name: 'All' },
				{ type: 'dashboard', name: 'Dash', cells: [{ view: 'All', stat: { fn: 'count' } }] }
			]
		}));
		assert.equal(asked(events).length, 1);
		assert.equal(await rowCount(), before + 1);
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

	it('C151 unknown keys in dashboard cells are stripped', async () => {
		const plan = goodPlan() as { items: Json[] };
		plan.items[1] = {
			...plan.items[1],
			properties: [{ name: 'Name', type: 'title' }, { name: 'Stage', type: 'status', options: ['A'] }],
			views: [
				{ type: 'table', name: 'All' },
				{ type: 'dashboard', name: 'Dash', cells: [{ view: 'All', url: 'https://x', webhook: 'https://y' }] }
			],
			rows: [],
		};
		const data = asked(await ask(plan))[0].data as { approvalId: string };
		const row = await app.db.query(`select args from public.ai_approvals where id = $1`, [data.approvalId]);
		const text = JSON.stringify(row.rows[0].args);
		assert.ok(!text.includes('url'), 'no url stored');
		assert.ok(!text.includes('webhook'), 'no webhook stored');
		assert.ok(!text.includes('https://x'));
		assert.ok(!text.includes('https://y'));
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

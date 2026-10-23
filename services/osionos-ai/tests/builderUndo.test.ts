import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { SseStream, collect } from './sse.ts';
import type { SseEvent } from './sse.ts';

/**
 * C159: undo a build; C161: the abuse limits of the builder.
 *
 * The pages the mock bridge "creates" are mirrored into `public.osionos_pages`
 * by the test itself: the undo's foreign-children check reads that table, and
 * a real bridge updates it on the archive PATCH. The hook on the mock does the
 * same here, so a child archived by the undo is no longer live when its parent
 * is checked.
 */
process.env.OSIONOS_AI_BUILDERS = 'on';
process.env.OSIONOS_AI_BUILD_BUDGET_MS = '500';
// One build a day: the test flushes the day bucket before each case, and the
// over-limit case is two passes on purpose.
process.env.OSIONOS_AI_BUILDS_PER_DAY = '1';
const { startHarness, USER_A, USER_B, WORKSPACE_A } = await import('./harness.ts');
const { app, bridge, mock, postRun, tokenFor, createConversation, call } = await startHarness();
const { allItems } = await import('../src/builders/items.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

type Json = Record<string, unknown>;

/** A plan of three pages (one holds a child) and one database. */
function undoPlan(): Json {
	return {
		workspaceId: WORKSPACE_A,
		title: 'Undo workspace',
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
			{ kind: 'page', key: 'about', title: 'About', blocks: [{ type: 'paragraph', content: 'About' }] },
			{
				kind: 'database',
				key: 'deals',
				title: 'Deals',
				properties: [{ name: 'Name', type: 'title' }],
				views: [{ type: 'table', name: 'All' }],
				rows: [],
			},
		],
	};
}

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

function asked(events: SseEvent[]): SseEvent[] {
	return events.filter((event) => event.event === 'permission.asked');
}

async function decide(approvalId: string, decision = 'approve', token = tokenFor(USER_A, WORKSPACE_A)) {
	return call(`/api/ai/approvals/${approvalId}`, {
		method: 'POST',
		token,
		body: { decision },
	});
}

async function undo(approvalId: string, token = tokenFor(USER_A, WORKSPACE_A)) {
	return call(`/api/ai/approvals/${approvalId}/undo`, { method: 'POST', token });
}

async function resume(approvalId: string, token = tokenFor(USER_A, WORKSPACE_A)) {
	return call(`/api/ai/approvals/${approvalId}/resume`, { method: 'POST', token, body: {} });
}

/** The whole windows and day buckets of the service, for one isolated case. */
async function flushLimits(): Promise<void> {
	const keys = await app.redis.keys('ai:rl:*');
	if (keys.length > 0) await app.redis.del(...keys);
}

/** The ids of the plan, as they were minted into the stored approval. */
async function storedPlan(approvalId: string): Promise<Json> {
	const result = await app.db.query('select args from public.ai_approvals where id = $1', [approvalId]);
	return result.rows[0].args as Json;
}

/** The page ids of a stored plan, by item key. */
function pageIds(plan: Json): Record<string, string> {
	const ids: Record<string, string> = {};
	const walk = (items: unknown[]): void => {
		for (const entry of items) {
			const item = entry as { kind?: string; key?: string; id?: string; children?: unknown[] };
			if (item.kind === 'page' && item.key && item.id) ids[item.key] = item.id;
			if (Array.isArray(item.children)) walk(item.children);
		}
	};
	walk(plan.items as unknown[]);
	return ids;
}

/** Build a plan and return its approval id and its minted page ids. */
async function buildPlan(plan = undoPlan()): Promise<{ approvalId: string; ids: Record<string, string> }> {
	await flushLimits();
	const events = await ask(plan);
	const data = asked(events)[0]?.data as { approvalId?: string } | undefined;
	assert.ok(data?.approvalId, 'the plan is asked');
	const approvalId = data.approvalId;
	const ids = pageIds(await storedPlan(approvalId));
	const decided = await decide(approvalId);
	assert.equal(decided.status, 200);
	return { approvalId, ids };
}

/**
 * Seed the pages the mock bridge "created", with their real parent links.
 * The mock's PATCH hook stamps `archived_at`, so the archive cascades in the
 * table exactly as the real bridge's would.
 */
async function seedBuiltPages(approvalId: string): Promise<void> {
	const items = await allItems(app.db, approvalId);
	const byKey = new Map(items.map((item) => [item.item_key, item]));
	for (const item of items) {
		if (item.kind !== 'page' || !item.created_id) continue;
		const parent = item.parent_key ? byKey.get(item.parent_key)?.created_id ?? null : null;
		await app.db.query(
			`insert into public.osionos_pages (id, workspace_id, parent_page_id, title)
			 values ($1, $2, $3, $4)
			 on conflict (id) do nothing`,
			[item.created_id, WORKSPACE_A, parent, item.item_key],
		);
	}
}

function patchedIds(): string[] {
	return bridge.calls
		.filter((call) => call.method === 'PATCH' && /^\/api\/pages\/[^/]+$/.test(call.path))
		.map((call) => decodeURIComponent(call.path.slice('/api/pages/'.length)));
}

describe('builder undo and limits', () => {
	before(async () => {
		bridge.onPatch = async ({ path, body }) => {
			const id = decodeURIComponent(path.slice('/api/pages/'.length));
			const archivedAt = (body as { archivedAt?: string } | null)?.archivedAt ?? new Date().toISOString();
			await app.db.query('update public.osionos_pages set archived_at = $2 where id = $1::uuid', [id, archivedAt]);
		};
	});

	beforeEach(async () => {
		await app.db.query('delete from public.ai_plan_items');
		await app.db.query('delete from public.ai_approvals');
		await app.db.query('delete from public.osionos_pages where workspace_id = $1', [WORKSPACE_A]);
		await flushLimits();
		bridge.reset();
		bridge.failWith = 0;
		bridge.delayMs = 0;
	});

	it('C159 a built plan is undone deepest first, and the databases are kept', async () => {
		const { approvalId, ids } = await buildPlan();
		await seedBuiltPages(approvalId);
		bridge.reset();

		const answer = await undo(approvalId);
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, {
			ok: true,
			approvalId,
			undone: 3,
			kept: 0,
			keptDatabases: 1,
			failed: 0,
		});

		const patched = patchedIds();
		assert.equal(patched.length, 3, 'one PATCH per built page');
		assert.ok(patched.includes(ids.about!) && patched.includes(ids.notes!) && patched.includes(ids.home!));
		assert.ok(patched.indexOf(ids.notes!) < patched.indexOf(ids.home!), 'the child goes before its parent');
		// Every PATCH carries the archive stamp; no database call is made.
		for (const call of bridge.calls.filter((c) => c.method === 'PATCH')) {
			assert.equal(typeof (call.body as { archivedAt?: unknown }).archivedAt, 'string');
		}
		assert.equal(bridge.calls.filter((c) => c.method === 'POST' && c.path === '/api/object-databases').length, 0);

		const items = await allItems(app.db, approvalId);
		for (const item of items) {
			assert.equal(item.status, item.kind === 'database' ? 'done' : 'undone', item.item_key);
		}
		const approval = await app.db.query('select status, result from public.ai_approvals where id = $1', [approvalId]);
		assert.equal(approval.rows[0].status, 'executed');
		assert.equal((approval.rows[0].result as { undone?: number }).undone, 3);
		const archived = await app.db.query(
			'select id from public.osionos_pages where id = any($1::uuid[]) and archived_at is not null',
			[[ids.home, ids.notes, ids.about]],
		);
		assert.equal(archived.rowCount, 3);
	});

	it('C159 a page that holds a foreign child is kept, and the foreign page is never touched', async () => {
		const { approvalId, ids } = await buildPlan();
		await seedBuiltPages(approvalId);
		const foreign = randomUUID();
		await app.db.query(
			`insert into public.osionos_pages (id, workspace_id, parent_page_id, title)
			 values ($1, $2, $3, 'Foreign')`,
			[foreign, WORKSPACE_A, ids.home],
		);
		bridge.reset();

		const answer = await undo(approvalId);
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, {
			ok: true,
			approvalId,
			undone: 2,
			kept: 1,
			keptDatabases: 1,
			failed: 0,
		});

		const patched = patchedIds();
		assert.deepEqual(new Set(patched), new Set([ids.about!, ids.notes!]));
		assert.ok(!patched.includes(ids.home!), 'the page holding the foreign child is not archived');
		assert.ok(!patched.includes(foreign), 'the foreign page is never PATCHed');

		const items = await allItems(app.db, approvalId);
		const home = items.find((item) => item.item_key === 'home')!;
		assert.equal(home.status, 'done');
		assert.equal(home.error, 'kept: it holds pages that this plan did not build');
		assert.equal(items.find((item) => item.item_key === 'about')!.status, 'undone');
		assert.equal(items.find((item) => item.item_key === 'notes')!.status, 'undone');
		assert.equal(items.find((item) => item.item_key === 'deals')!.status, 'done');
		const homeRow = await app.db.query('select archived_at from public.osionos_pages where id = $1', [ids.home]);
		assert.equal(homeRow.rows[0].archived_at, null);
	});

	it('C159 a second undo, a stranger, a non-plan and a pending plan are refused', async () => {
		const { approvalId } = await buildPlan();
		await seedBuiltPages(approvalId);
		bridge.reset();
		assert.equal((await undo(approvalId)).status, 200);

		const second = await undo(approvalId);
		assert.equal(second.status, 409);
		assert.equal((second.body as { code?: string }).code, 'nothing_to_undo');

		// A stranger and an unknown id answer the same bytes.
		const stranger = await undo(approvalId, tokenFor(USER_B, WORKSPACE_A));
		const unknown = await undo(randomUUID());
		assert.equal(stranger.status, 404);
		assert.equal(unknown.status, 404);
		assert.deepEqual(stranger.body, unknown.body);

		// A non-plan approval.
		const other = randomUUID();
		const base = await app.db.query('select run_id, conversation_id from public.ai_approvals where id = $1', [approvalId]);
		await app.db.query(
			`insert into public.ai_approvals
			   (id, run_id, conversation_id, owner_id, workspace_id, tool, args, args_sha256, status, expires_at)
			 values ($1, $2, $3, $4, $5, 'create_page', '{}'::jsonb, 'sha', 'executed', now() + interval '10 minutes')`,
			[other, base.rows[0].run_id, base.rows[0].conversation_id, USER_A, WORKSPACE_A],
		);
		const notPlan = await undo(other);
		assert.equal(notPlan.status, 409);
		assert.equal((notPlan.body as { code?: string }).code, 'not_a_plan');

		// A plan that has not been built.
		const pendingEvents = await ask(undoPlan());
		const pending = asked(pendingEvents)[0].data as { approvalId: string };
		const notBuilt = await undo(pending.approvalId);
		assert.equal(notBuilt.status, 409);
		assert.equal((notBuilt.body as { code?: string }).code, 'approval_not_built');
	});

	it('C159 two concurrent undos archive each page exactly once', async () => {
		const { approvalId } = await buildPlan();
		await seedBuiltPages(approvalId);
		bridge.reset();

		const [one, two] = await Promise.all([undo(approvalId), undo(approvalId)]);
		assert.ok([one.status, two.status].every((status) => status === 200 || status === 409));

		const patched = patchedIds();
		const unique = new Set(patched);
		assert.equal(unique.size, 3, 'three built pages');
		for (const id of unique) {
			assert.equal(patched.filter((candidate) => candidate === id).length, 1, `${id} is PATCHed once`);
		}
	});

	it('C159 a bridge refusal puts that item back to done and counts it failed', async () => {
		const { approvalId, ids } = await buildPlan();
		await seedBuiltPages(approvalId);
		bridge.reset();
		bridge.failNextWith(503, 1);

		const answer = await undo(approvalId);
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, {
			ok: true,
			approvalId,
			undone: 2,
			kept: 0,
			keptDatabases: 1,
			failed: 1,
		});

		// The first page in the reverse order is the failing one.
		const items = await allItems(app.db, approvalId);
		const about = items.find((item) => item.item_key === 'about')!;
		assert.equal(about.status, 'done');
		assert.equal(about.error, 'the bridge refused the write (503)');
		assert.equal(items.find((item) => item.item_key === 'notes')!.status, 'undone');
		assert.equal(items.find((item) => item.item_key === 'home')!.status, 'undone');
		const aboutRow = await app.db.query('select archived_at from public.osionos_pages where id = $1', [ids.about]);
		assert.equal(aboutRow.rows[0].archived_at, null, 'the refused page is not archived');
	});

	it('C161 a fourth pending plan is refused, and no row is written', async () => {
		for (let i = 0; i < 3; i++) {
			const events = await ask(undoPlan());
			assert.equal(asked(events).length, 1, `plan ${i + 1} is asked`);
		}
		const before = await app.db.query(`select count(*)::int as n from public.ai_approvals where tool = 'build_plan'`);
		assert.equal(before.rows[0].n, 3);

		const events = await ask(undoPlan());
		assert.equal(asked(events).length, 0, 'the fourth plan asks nothing');
		const after = await app.db.query(`select count(*)::int as n from public.ai_approvals where tool = 'build_plan'`);
		assert.equal(after.rows[0].n, 3, 'no new row');
		const results = events.filter((event) => event.event === 'tool.result');
		assert.ok(
			results.some((event) => (event.data as { error?: string }).error === 'too many plans are waiting'),
			'the model is told the plans are waiting',
		);
	});

	it('C161 the next approve and the resume are 429 and leave the approval where it was', async () => {
		// The first pass fills the day's bucket and leaves the plan partial.
		bridge.delayMs = 300;
		const first = await buildPlan();
		const partial = await app.db.query('select status from public.ai_approvals where id = $1', [first.approvalId]);
		assert.equal(partial.rows[0].status, 'partial');

		bridge.delayMs = 0;
		bridge.reset();
		const nextEvents = await ask(undoPlan());
		const next = asked(nextEvents)[0].data as { approvalId: string };
		const refused = await decide(next.approvalId);
		assert.equal(refused.status, 429);
		assert.equal((refused.body as { code?: string }).code, 'build_limit_reached');
		const stillPending = await app.db.query('select status from public.ai_approvals where id = $1', [next.approvalId]);
		assert.equal(stillPending.rows[0].status, 'pending');
		assert.equal(bridge.count, 0, 'no bridge call for the refused approve');

		const resumed = await resume(first.approvalId);
		assert.equal(resumed.status, 429);
		assert.equal((resumed.body as { code?: string }).code, 'build_limit_reached');
		const stillPartial = await app.db.query('select status from public.ai_approvals where id = $1', [first.approvalId]);
		assert.equal(stillPartial.rows[0].status, 'partial');
		assert.equal(bridge.count, 0, 'no bridge call for the refused resume');
	});
});

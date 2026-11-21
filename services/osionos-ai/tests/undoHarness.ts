import assert from 'node:assert/strict';
import { before, beforeEach } from 'node:test';
import type { Json } from './builderHarness.ts';


/**
 * Shared setup of the undo test files (C159, C161).
 *
 * The pages the mock bridge "creates" are mirrored into `public.osionos_pages`
 * by the test itself: the undo's foreign-children check reads that table, and
 * a real bridge updates it on the archive PATCH. The hook on the mock does the
 * same here, so a child archived by the undo is no longer live when its parent
 * is checked.
 */

// Set before builderHarness is imported: the budget and the daily cap are read at load.
process.env.OSIONOS_AI_BUILD_BUDGET_MS = '500';
// One build a day: the tests flush the day bucket before each case, and the
// over-limit case is two passes on purpose.
process.env.OSIONOS_AI_BUILDS_PER_DAY = '1';
export const builder = await import('./builderHarness.ts');
export const { goodPlan, ask, asked, decide, closeBuilderHarness, harness } = builder;
export const { USER_A, USER_B, WORKSPACE_A } = await import('./harness.ts');
export const { app, bridge, tokenFor, call } = harness;
export const { allItems } = await import('../src/builders/items.ts');

/** The plan of builderHarness plus a sibling page: three pages (one holds a child) and one database. */
export function undoPlan(): Json {
	const [home, deals] = goodPlan().items as Json[];
	return goodPlan({
		title: 'Undo workspace',
		items: [home, { kind: 'page', key: 'about', title: 'About', blocks: [{ type: 'paragraph', content: 'About' }] }, deals],
	});
}

export async function undo(approvalId: string, token = tokenFor(USER_A, WORKSPACE_A)) {
	return call(`/api/ai/approvals/${approvalId}/undo`, { method: 'POST', token });
}

export async function resume(approvalId: string, token = tokenFor(USER_A, WORKSPACE_A)) {
	return call(`/api/ai/approvals/${approvalId}/resume`, { method: 'POST', token, body: {} });
}

/** The whole windows and day buckets of the service, for one isolated case. */
export async function flushLimits(): Promise<void> {
	const keys = await app.redis.keys('ai:rl:*');
	if (keys.length > 0) await app.redis.del(...keys);
}

/** The ids of the plan, as they were minted into the stored approval. */
export async function storedPlan(approvalId: string): Promise<Json> {
	const result = await app.db.query('select args from public.ai_approvals where id = $1', [approvalId]);
	return result.rows[0].args as Json;
}

/** The page ids of a stored plan, by item key. */
export function pageIds(plan: Json): Record<string, string> {
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
export async function buildPlan(plan = undoPlan()): Promise<{ approvalId: string; ids: Record<string, string> }> {
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
export async function seedBuiltPages(approvalId: string): Promise<void> {
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

export function patchedIds(): string[] {
	return bridge.calls
		.filter((call) => call.method === 'PATCH' && /^\/api\/pages\/[^/]+$/.test(call.path))
		.map((call) => decodeURIComponent(call.path.slice('/api/pages/'.length)));
}

/**
 * Park the PATCH of one page inside the mock until `release()`; with `fail` the
 * parked write then errors, as a bridge that lost the race would.
 */
export function holdPatch(pageId: string, options: { fail?: boolean } = {}): { reached: Promise<void>; release: () => void } {
	const inner = bridge.onPatch!;
	let release!: () => void;
	let reached!: () => void;
	const gate = new Promise<void>((resolve) => (release = resolve));
	const reachedPromise = new Promise<void>((resolve) => (reached = resolve));
	bridge.onPatch = async (call) => {
		if (decodeURIComponent(call.path.slice('/api/pages/'.length)) !== pageId) return inner(call);
		reached();
		await gate;
		if (options.fail) throw new Error('lost the race');
		return inner(call);
	};
	return { reached: reachedPromise, release };
}

/** The archive-stamping PATCH hook and the per-case reset, for a describe block. */
export function installUndoHooks(): void {
	let defaultPatchHook: typeof bridge.onPatch;
	before(async () => {
		bridge.onPatch = async ({ path, body }) => {
			const id = decodeURIComponent(path.slice('/api/pages/'.length));
			const archivedAt = (body as { archivedAt?: string } | null)?.archivedAt ?? new Date().toISOString();
			await app.db.query('update public.osionos_pages set archived_at = $2 where id = $1::uuid', [id, archivedAt]);
		};
		defaultPatchHook = bridge.onPatch;
	});

	beforeEach(async () => {
		bridge.onPatch = defaultPatchHook;
		await app.db.query('delete from public.ai_plan_items');
		await app.db.query('delete from public.ai_approvals');
		await app.db.query('delete from public.osionos_pages where workspace_id = $1', [WORKSPACE_A]);
		await flushLimits();
		bridge.reset();
		bridge.failWith = 0;
		bridge.delayMs = 0;
	});
}

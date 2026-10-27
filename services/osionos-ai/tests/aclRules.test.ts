import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { AuthUser } from '../src/auth.ts';
import type { QueryRunner } from '../src/db.ts';
import { readablePages } from '../src/retrieval/search.ts';
import { canReadPageWithRules } from '../src/retrieval/shareRules.ts';

/**
 * The ACL read of the AI service against a fake database.
 *
 * Proves that canReadPageWithRules and readablePages apply BOTH
 * canReadPageRowAsMember AND share-rule checks, and that errors close
 * rather than leak.
 */

const WS1 = '1000000a-0000-4000-8000-00000000000a';
const WS2 = '10000000-0000-4000-8000-000000000002';
const USER = '2000000a-0000-4000-8000-00000000000a';
const OTHER_MEMBER = '20000000-0000-4000-8000-000000000002';
const PAGE_OWNER = '20000000-0000-4000-8000-000000000003';
const WS_OWNER = '20000000-0000-4000-8000-000000000004';
const PAGE_A = '4000000a-0000-4000-8000-00000000000a';
const PAGE_C = '4000000c-0000-4000-8000-00000000000c';
const PAGE_D = '4000000d-0000-4000-8000-00000000000d';
const TABLES = ['osionos_share_rules', 'osionos_workspace_members', 'osionos_workspaces', 'osionos_pages', 'osionos_team_members'];

type Row = Record<string, unknown>;
type Page = { id: string; workspace_id: string; owner_id: string; visibility: string; collaborators: unknown[]; parent_page_id: string | null; title: string | null };
type Call = { sql: string; params: unknown[] | undefined };
type World = { pages: Page[]; rules: Row[]; members: Row[]; workspaces: Row[]; teams: Row[]; fail: { table: string; workspaceId?: string }[] };

function page(id: string, overrides: Partial<Page> = {}): Page {
	return { id, workspace_id: WS1, owner_id: PAGE_OWNER, visibility: 'shared', collaborators: [], parent_page_id: null, title: null, ...overrides };
}

let ruleCount = 0;
function rule(resourceId: string, permission: string, target: Row, workspaceId = WS1): Row {
	ruleCount += 1;
	return { id: `rule-${ruleCount}`, workspace_id: workspaceId, resource_type: 'page', resource_id: resourceId, target, permission, explicit: true };
}

/** Two workspaces, three plain members in both, and an owner (WS_OWNER) who has no member row. */
function world(pages: Page[], extra: Partial<World> = {}): World {
	const members = [USER, OTHER_MEMBER, PAGE_OWNER].flatMap((userId) =>
		[WS1, WS2].map((workspaceId) => ({ user_id: userId, workspace_id: workspaceId, role: 'member', permissions: ['read'] })));
	const workspaces = [WS1, WS2].map((id) => ({ id, owner_id: WS_OWNER }));
	return { pages, rules: [], members, workspaces, teams: [], fail: [], ...extra };
}

/** What each statement would answer: its WHERE applied to the parameters, its LIMIT honoured. */
function answer(w: World, table: string, params: unknown[]): Row[] {
	const lower = (value: unknown) => String(value).toLowerCase();
	const insideAny = (list: unknown, value: unknown) => (list as string[]).includes(lower(value));
	switch (table) {
		case 'osionos_share_rules':
			return w.rules.filter((r) => lower(r.workspace_id) === params[0]).slice(0, Number(params[1]));
		case 'osionos_workspace_members':
			return w.members.filter((m) => m.user_id === params[0] && insideAny(params[1], m.workspace_id));
		case 'osionos_workspaces':
			return w.workspaces.filter((ws) => insideAny(params[0], ws.id));
		case 'osionos_pages':
			return w.pages.filter((p) => lower(p.workspace_id) === params[0]).slice(0, Number(params[1]))
				.map((p) => ({ id: p.id, parent_page_id: p.parent_page_id }));
		default:
			return w.teams.filter((t) => t.workspace_id === params[0] && t.user_id === params[1]).slice(0, Number(params[2]));
	}
}

function fakeDb(w: World): { db: QueryRunner; calls: Call[] } {
	const calls: Call[] = [];
	const db = {
		async query(sql: string, params?: unknown[]) {
			calls.push({ sql, params });
			if (!Array.isArray(params)) throw new Error('query called without a params array');
			if (sql.includes('archived_at is null')) {
				const ids = params[0] as string[];
				return {
					rows: w.pages.filter((p) => ids.includes(p.id)).map((p) => ({
						id: p.id,
						workspace_id: p.workspace_id,
						owner_id: p.owner_id,
						visibility: p.visibility,
						collaborators: p.collaborators,
						title: p.title,
					})),
				};
			}
			const table = TABLES.find((name) => sql.includes(`public.${name}`));
			if (!table) throw new Error(`unexpected statement: ${sql}`);
			if (w.fail.some((f) => f.table === table && (f.workspaceId === undefined || params.includes(f.workspaceId)))) {
				throw new Error(`relation "public.${table}" does not exist`);
			}
			return { rows: answer(w, table, params) };
		},
	};
	return { db: db as unknown as QueryRunner, calls };
}

function userAs(userId: string): AuthUser {
	return { userId, workspaceId: WS1, memberWorkspaces: [], isAdmin: false, issuedAtMs: 0 };
}

function aclWorld(extra: Partial<World> = {}): World {
	const pages = [page(PAGE_A), page(PAGE_C, { parent_page_id: PAGE_A }), page(PAGE_D)];
	return world(pages, {
		rules: [rule(PAGE_A, 'no_access', { type: 'user', userId: USER })],
		...extra,
	});
}

const queried = (calls: Call[], table: string) => calls.some((call) => call.sql.includes(`public.${table}`));

let warn: { mock: { callCount(): number } };
beforeEach(() => {
	warn = mock.method(console, 'warn', () => undefined);
});
afterEach(() => mock.restoreAll());

describe('canReadPageWithRules', () => {
	it('c1. keeps a member page without its own rule and consults the rules table', async () => {
		const { db, calls } = fakeDb(aclWorld());
		assert.equal(await canReadPageWithRules(db, USER, page(PAGE_D), [WS1]), true);
		assert.equal(queried(calls, 'osionos_share_rules'), true);
	});

	it('c2. hides a page that inherits no_access from its parent', async () => {
		const { db } = fakeDb(aclWorld());
		assert.equal(await canReadPageWithRules(db, USER, page(PAGE_C, { parent_page_id: PAGE_A }), [WS1]), false);
	});

	it('c3. rejects a non-member row before reading share rules', async () => {
		const { db, calls } = fakeDb(aclWorld());
		assert.equal(await canReadPageWithRules(db, USER, page(PAGE_D, { workspace_id: WS2 }), [WS1]), false);
		assert.equal(queried(calls, 'osionos_share_rules'), false);
	});

	it('c4. fails closed when the share-rules read throws', async () => {
		const w = aclWorld({ fail: [{ table: 'osionos_share_rules', workspaceId: WS1 }] });
		const { db } = fakeDb(w);
		assert.equal(await canReadPageWithRules(db, USER, page(PAGE_D), [WS1]), false);
		assert.equal(warn.mock.callCount(), 1);
	});
});

describe('readablePages', () => {
	it('c5. returns only P3 when P1 is denied and P2 inherits the deny', async () => {
		const { db } = fakeDb(aclWorld());
		const result = await readablePages(db, [PAGE_A, PAGE_C, PAGE_D], userAs(USER), [WS1]);
		assert.deepEqual([...result.keys()], [PAGE_D.toLowerCase()]);
	});

	it('c6. reads share rules in one batch, never per page', async () => {
		const { db, calls } = fakeDb(aclWorld());
		await readablePages(db, [PAGE_A, PAGE_C, PAGE_D], userAs(USER), [WS1]);
		const ruleReads = calls.filter((call) => call.sql.includes('public.osionos_share_rules')).length;
		assert.ok(ruleReads <= 1, `expected at most one share-rules read, got ${ruleReads}`);
	});

	it('c7. returns an empty map when the share-rules read throws', async () => {
		const w = aclWorld({ fail: [{ table: 'osionos_share_rules' }] });
		const { db } = fakeDb(w);
		const result = await readablePages(db, [PAGE_A, PAGE_C, PAGE_D], userAs(USER), [WS1]);
		assert.deepEqual(result, new Map());
		assert.equal(warn.mock.callCount(), 1);
	});
});

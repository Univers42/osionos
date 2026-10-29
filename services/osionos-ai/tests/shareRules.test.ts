import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { AuthUser } from '../src/auth.ts';
import type { QueryRunner } from '../src/db.ts';
import { filterByRules, loadAccessMaps, readableByRules } from '../src/retrieval/shareRules.ts';

/**
 * The share-rule read of the AI service against a fake database.
 *
 * The decision itself (pageAccessLevel) is the bridge's and is tested there; these
 * cases prove that the reads feed it the way the bridge's loader does, and that every
 * read that fails or hits a limit closes the workspace instead of opening it. The fake
 * applies the WHERE of each statement to the parameters it is given, so a value in the
 * wrong position, or spliced into the SQL text, finds nothing.
 */

const WS1 = '1000000a-0000-4000-8000-00000000000a';
const WS2 = '10000000-0000-4000-8000-000000000002';
const USER = '2000000a-0000-4000-8000-00000000000a';
const OTHER_MEMBER = '20000000-0000-4000-8000-000000000002';
const PAGE_OWNER = '20000000-0000-4000-8000-000000000003';
const WS_OWNER = '20000000-0000-4000-8000-000000000004';
const OUTSIDER = '20000000-0000-4000-8000-000000000005';
const TEAM = '30000000-0000-4000-8000-000000000001';
const PAGE_P = '40000000-0000-4000-8000-000000000001';
const PAGE_A = '4000000a-0000-4000-8000-00000000000a';
const PAGE_C = '4000000c-0000-4000-8000-00000000000c';
const PAGE_D = '4000000d-0000-4000-8000-00000000000d';
const PAGE_Q = '40000000-0000-4000-8000-000000000005';
const ALL_IDS = [WS1, WS2, USER, OTHER_MEMBER, PAGE_OWNER, WS_OWNER, OUTSIDER, TEAM, PAGE_P, PAGE_A, PAGE_C, PAGE_D, PAGE_Q];
const TABLES = ['osionos_share_rules', 'osionos_workspace_members', 'osionos_workspaces', 'osionos_pages', 'osionos_team_members'];

type Row = Record<string, unknown>;
type Page = { id: string; workspace_id: string; owner_id: string; visibility: string; collaborators: unknown[]; parent_page_id: string | null };
type Call = { sql: string; params: unknown[] | undefined };
type World = { pages: Page[]; rules: Row[]; members: Row[]; workspaces: Row[]; teams: Row[]; fail: { table: string; workspaceId?: string }[] };

function page(id: string, overrides: Partial<Page> = {}): Page {
	return { id, workspace_id: WS1, owner_id: PAGE_OWNER, visibility: 'shared', collaborators: [], parent_page_id: null, ...overrides };
}

let ruleCount = 0;
function rule(resourceId: string, permission: string, target: Row, workspaceId = WS1): Row {
	ruleCount += 1;
	return { id: `rule-${ruleCount}`, workspace_id: workspaceId, resource_type: 'page', resource_id: resourceId, target, permission, explicit: true };
}

function filler(count: number): string[] {
	return Array.from({ length: count }, (_, index) => `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
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

/** The ids readableByRules lets `userId` see among `rows` (default: every page of the world). */
async function visible(w: World, userId: string, rows: Page[] = w.pages): Promise<{ ids: string[]; calls: Call[] }> {
	const { db, calls } = fakeDb(w);
	const out = await readableByRules(db, userAs(userId), rows);
	return { ids: out.map((row) => row.id), calls };
}

const queried = (calls: Call[], table: string) => calls.some((call) => call.sql.includes(`public.${table}`));

let warn: { mock: { callCount(): number } };
beforeEach(() => {
	warn = mock.method(console, 'warn', () => undefined);
});
afterEach(() => mock.restoreAll());

describe('readableByRules', () => {
	it('1. with no rules keeps what the visibility default keeps, and skips the parent read', async () => {
		const own = page(PAGE_P, { owner_id: USER, visibility: 'private' });
		const shared = page(PAGE_A);
		const foreign = page(PAGE_C, { visibility: 'private' });
		const { ids, calls } = await visible(world([own, shared, foreign]), USER);
		assert.deepEqual(ids, [PAGE_P, PAGE_A]);
		assert.equal(queried(calls, 'osionos_pages'), false);
		assert.equal(queried(calls, 'osionos_team_members'), false);
	});

	it('2. a user no_access rule hides the page for that user only', async () => {
		const w = world([page(PAGE_P), page(PAGE_D)], { rules: [rule(PAGE_P, 'no_access', { type: 'user', userId: USER })] });
		assert.deepEqual((await visible(w, USER)).ids, [PAGE_D]);
		assert.deepEqual((await visible(w, OTHER_MEMBER)).ids, [PAGE_P, PAGE_D]);
	});

	it('3. a team no_access rule hides the page for a team member only, and reads the teams', async () => {
		const w = world([page(PAGE_P), page(PAGE_D)], {
			rules: [rule(PAGE_P, 'no_access', { type: 'team', teamId: TEAM })],
			teams: [{ workspace_id: WS1, user_id: USER, team_id: TEAM }],
		});
		const inTeam = await visible(w, USER);
		assert.deepEqual(inTeam.ids, [PAGE_D]);
		assert.equal(queried(inTeam.calls, 'osionos_team_members'), true);
		assert.deepEqual((await visible(w, OTHER_MEMBER)).ids, [PAGE_P, PAGE_D]);
	});

	it('4. a workspace no_access rule hides the page from a plain member, not from the page owner or the workspace owner', async () => {
		const w = world([page(PAGE_P)], { rules: [rule(PAGE_P, 'no_access', { type: 'workspace' })] });
		assert.deepEqual((await visible(w, USER)).ids, []);
		assert.deepEqual((await visible(w, PAGE_OWNER)).ids, [PAGE_P]);
		assert.deepEqual((await visible(w, WS_OWNER)).ids, [PAGE_P]);
		assert.deepEqual((await visible(w, OUTSIDER)).ids, []);
	});

	it('5. a no_access rule on an ancestor hides the child', async () => {
		const pages = [page(PAGE_A), page(PAGE_C, { parent_page_id: PAGE_A }), page(PAGE_D)];
		const w = world(pages, { rules: [rule(PAGE_A, 'no_access', { type: 'user', userId: USER })] });
		assert.deepEqual((await visible(w, USER)).ids, [PAGE_D]);
	});

	it('6. a nearer can_view does not lift a deny above it', async () => {
		const pages = [page(PAGE_A), page(PAGE_C, { parent_page_id: PAGE_A })];
		const w = world(pages, {
			rules: [rule(PAGE_A, 'no_access', { type: 'user', userId: USER }), rule(PAGE_C, 'can_view', { type: 'user', userId: USER })],
		});
		assert.deepEqual((await visible(w, USER)).ids, []);
	});

	it('a can_view rule opens a private page the visibility default would hide', async () => {
		const w = world([page(PAGE_P, { visibility: 'private' })], { rules: [rule(PAGE_P, 'can_view', { type: 'user', userId: USER })] });
		assert.deepEqual((await visible(w, USER)).ids, [PAGE_P]);
		assert.deepEqual((await visible(w, OTHER_MEMBER)).ids, []);
	});

	it('matches ids whatever their case', async () => {
		const upper = (value: string) => value.toUpperCase();
		// A uuid of digits only is its own upper case: the ids of this case must carry hex letters.
		for (const id of [WS1, USER, PAGE_A]) assert.notEqual(upper(id), id);
		const pages = [
			page(upper(PAGE_A), { workspace_id: upper(WS1) }),
			page(upper(PAGE_C), { workspace_id: upper(WS1), parent_page_id: upper(PAGE_A) }),
			page(upper(PAGE_D), { workspace_id: upper(WS1) }),
		];
		const w = world(pages, { rules: [rule(upper(PAGE_A), 'no_access', { type: 'user', userId: upper(USER) })] });
		assert.deepEqual((await visible(w, USER)).ids, [upper(PAGE_D)]);
	});

	it('drops a row whose workspace id is not a uuid, and keeps the others', async () => {
		const { ids, calls } = await visible(world([page(PAGE_P), page(PAGE_D, { workspace_id: 'not-a-uuid' })]), USER);
		assert.deepEqual(ids, [PAGE_P]);
		assert.equal(calls.every((call) => !call.sql.includes('not-a-uuid')), true);
	});
});

describe('fail closed (C584)', () => {
	const rules = [rule(PAGE_P, 'can_view', { type: 'public' })];
	const twoWorkspaces = () => [page(PAGE_P), page(PAGE_Q, { workspace_id: WS2 })];

	it('7. a rules read that throws closes that workspace and leaves the other', async () => {
		const w = world(twoWorkspaces(), { rules, fail: [{ table: 'osionos_share_rules', workspaceId: WS1 }] });
		assert.deepEqual((await visible(w, USER)).ids, [PAGE_Q]);
		assert.equal(warn.mock.callCount(), 1);
	});

	it('a parents read that throws closes that workspace instead of leaving an empty map', async () => {
		const w = world(twoWorkspaces(), { rules, fail: [{ table: 'osionos_pages', workspaceId: WS1 }] });
		assert.deepEqual((await visible(w, USER)).ids, [PAGE_Q]);
		assert.equal(warn.mock.callCount(), 1);
	});

	for (const table of ['osionos_workspace_members', 'osionos_workspaces']) {
		it(`a ${table} read that throws closes every workspace`, async () => {
			const w = world(twoWorkspaces(), { fail: [{ table }] });
			assert.deepEqual((await visible(w, USER)).ids, []);
			assert.equal(warn.mock.callCount(), 1);
		});
	}

	it('8. a parents read of 20001 pages closes the workspace; exactly 20000 does not', async () => {
		const real = [page(PAGE_P), page(PAGE_D)];
		const fill = (count: number) => filler(count).map((id) => page(id));
		const over = world([...real, ...fill(20001 - real.length)], { rules });
		assert.deepEqual((await visible(over, USER, real)).ids, []);
		const edge = world([...real, ...fill(20000 - real.length)], { rules });
		assert.deepEqual((await visible(edge, USER, real)).ids, [PAGE_P, PAGE_D]);
	});

	it('9. a rules read of 20001 rows closes the workspace; exactly 20000 does not', async () => {
		const real = [page(PAGE_P)];
		const fill = (count: number) => filler(count).map((id) => rule(id, 'can_view', { type: 'public' }));
		const over = world(real, { rules: fill(20001) });
		assert.deepEqual((await visible(over, USER)).ids, []);
		const edge = world(real, { rules: fill(20000) });
		assert.deepEqual((await visible(edge, USER)).ids, [PAGE_P]);
	});

	it('a failed team read keeps the workspace open and keeps the team deny', async () => {
		const w = world([page(PAGE_P), page(PAGE_D)], {
			rules: [rule(PAGE_P, 'no_access', { type: 'team', teamId: TEAM })],
			fail: [{ table: 'osionos_team_members' }],
		});
		assert.deepEqual((await visible(w, USER)).ids, [PAGE_D]);
	});

	it('a workspace that is absent from the maps drops all its rows', async () => {
		const rows = [page(PAGE_P)];
		assert.deepEqual(filterByRules(rows, userAs(USER), new Map()), []);
		const { db } = fakeDb(world(rows, { fail: [{ table: 'osionos_share_rules' }] }));
		assert.equal((await loadAccessMaps(db, userAs(USER), [WS1])).has(WS1), false);
	});
});

describe('parameters', () => {
	it('sends every statement a params array and no id inside the SQL text', async () => {
		const pages = [page(PAGE_P), page(PAGE_A), page(PAGE_C, { parent_page_id: PAGE_A })];
		const w = world(pages, {
			rules: [rule(PAGE_P, 'no_access', { type: 'team', teamId: TEAM })],
			teams: [{ workspace_id: WS1, user_id: USER, team_id: TEAM }],
		});
		const { ids, calls } = await visible(w, USER);
		assert.deepEqual(ids, [PAGE_A, PAGE_C]);
		for (const table of TABLES) assert.equal(queried(calls, table), true, `${table} was never queried`);
		for (const call of calls) {
			assert.ok(Array.isArray(call.params), `no params array: ${call.sql}`);
			for (const id of ALL_IDS) assert.equal(call.sql.toLowerCase().includes(id), false, `${id} is spliced into: ${call.sql}`);
		}
		const members = calls.find((call) => call.sql.includes('public.osionos_workspace_members'));
		assert.deepEqual(members?.params, [USER, [WS1]]);
	});
});

import type { QueryResultRow } from 'pg';
import type { AuthUser } from '../auth.ts';
import type { QueryRunner } from '../db.ts';
import { pageAccessLevel, pageRuleLevel } from '../../../../scripts/bridge-page-access.mjs';
import { sameId, canReadPageRowAsMember } from '../../../../scripts/bridge-page-read.mjs';

/**
 * The page share rules of the bridge, for the AI read path.
 *
 * The retrieval and the tools read a page by its visibility alone (acl.ts), so
 * a page hidden by a no_access rule - its own, a team's, the workspace's or an
 * ancestor's - still reached the model. The bridge decides that in
 * pageAccessLevel (scripts/bridge-page-access.mjs). This file is the SQL twin
 * of the bridge's loader (pageAccessEntry in scripts/bridge-api.mjs,
 * listForWorkspace and teamIdsFor in scripts/bridge-perms-rules.mjs): it builds
 * the same inputs and calls the same pure function, so the decision is written
 * once and only the reads are written here.
 *
 * Fails closed (verdict C584). A workspace whose rules, members, owners or
 * parents cannot be read in full - an error, a missing table, a limit - is left
 * OUT of the maps, and filterByRules drops every row of a workspace that is not
 * in them. "No rules" is only ever the answer of a read that worked and found
 * none. The team read is the one exception, and it is the bridge's: a failed
 * read is teamIds null, which the evaluator reads as "unknown" (a team deny
 * still blocks, a team grant grants nothing).
 *
 * Every value reaches the database as a parameter ($1, $2...), never inside the
 * SQL text.
 *
 * Caveat: a workspace with at least one rule pays one read of up to 20,001
 * pages (id, parent_page_id) on EVERY call. Nothing is cached, so a move is seen
 * at once, but a big workspace is slow. More than 20,000 rules or 20,000 pages
 * makes the workspace unreadable (all its rows are dropped, never some), and 500
 * or more team rows make teamIds null. The statements are not one snapshot: a
 * rule written or a page moved by a concurrent request, or by a stale tab, is
 * seen from the NEXT call, and a call that races the write may see one read
 * before it and another after. The bridge reads a missing share-rules table as
 * "no rules"; here it is a closed workspace. With a pool as db, a call opens one
 * connection per workspace at a time.
 */

/** A rule row as the table stores it; the evaluator (bridge-share-rules.mjs) reads these fields. */
type ShareRuleRow = {
	id: string;
	workspace_id: string;
	resource_type: string;
	resource_id: string | null;
	target: { type?: unknown } | null;
	permission: string;
	explicit: boolean;
};
type WorkspaceMember = { role: string; permissions: unknown };

/** What pageAccessLevel needs for one workspace, in the shape the bridge's loader hands it. */
export type AccessEntry = {
	member: WorkspaceMember | null;
	rulesByPage: Map<string, ShareRuleRow[]>;
	parentOf: Map<string, string | null> | null;
	pageMeta: Map<string, PageMeta> | null;
	teamIds: string[] | null;
	attributes: { name: string; value: string }[] | null;
};

/** A page's owner and visibility: a private page takes grants only from its owner's private ancestors (X1). */
type PageMeta = { owner_id: string | null; visibility: string | null };

/** Lower-case workspace id -> its entry. A workspace that is not here is closed. */
export type AccessMaps = Map<string, AccessEntry>;

/** A page row as query result, with its id and workspace_id guaranteed. */
export type PageAccessRow = QueryResultRow & { id: string; workspace_id: string };

// One past each limit, so a full answer proves the workspace is bigger than the limit
// instead of being silently cut at it. The same limits as the bridge's loader.
const MAX_RULES = 20_000;
const MAX_PAGES = 20_000;
const MAX_TEAMS = 500;
const MAX_ATTRIBUTES = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The workspace owner keeps access without a member row (C557 parenthetical); the bridge
// gives them this synthetic row (ownerAwareMemberRow in scripts/bridge-api.mjs).
const OWNER_PERMISSIONS = ['create', 'read', 'update', 'delete', 'admin'];

const RULES_SQL = `select id, workspace_id, resource_type, resource_id, target, permission, explicit
	from public.osionos_share_rules
	where workspace_id = $1::uuid and resource_type = 'page'
	order by created_at
	limit $2::int`;
const MEMBERS_SQL = `select workspace_id, role, permissions
	from public.osionos_workspace_members
	where user_id = $1::uuid and workspace_id = any($2::uuid[])`;
const OWNERS_SQL = `select id, owner_id
	from public.osionos_workspaces
	where id = any($1::uuid[])`;
const PARENTS_SQL = `select id, parent_page_id, owner_id, visibility
	from public.osionos_pages
	where workspace_id = $1::uuid
	limit $2::int`;
const OWNED_PAGES_SQL = `select id from public.osionos_pages where id = any($1::uuid[]) and owner_id = $2::uuid`;
const TEAMS_SQL = `select team_id
	from public.osionos_team_members
	where workspace_id = $1::uuid and user_id = $2::uuid
	limit $3::int`;
const ATTRIBUTES_SQL = `select name, value
	from public.osionos_member_attributes
	where workspace_id = $1::uuid and user_id = $2::uuid
	limit $3::int`;

/** An id as a Map key: Postgres stores lower-case, a token or a rule may carry upper-case. */
function lowerId(value: unknown): string {
	return value == null ? '' : String(value).toLowerCase();
}

/**
 * Why a read failed, for the operator. A closed workspace is silent to the caller (it
 * just finds nothing), so without this line an outage reads as "no pages". Logs the
 * code or the name only: a driver message can carry connection details.
 */
function warnFailedRead(scope: string, error: unknown): void {
	const code = (error as { code?: unknown } | null)?.code;
	const name = error instanceof Error ? error.name : 'unknown';
	console.warn(JSON.stringify({ event: 'share_rules_read_failed', scope, code: typeof code === 'string' ? code : name }));
}

/** The error of a read that hit its limit: unreadable, never a partial answer. */
function overLimit(what: string): Error {
	return Object.assign(new Error(`${what} are over their limit`), { code: 'share_rules_over_limit' });
}

/** The rows of one statement; a driver that answers anything but an array is a failed read. */
async function rowsOf<R extends QueryResultRow>(db: QueryRunner, sql: string, params: unknown[]): Promise<R[]> {
	const { rows } = await db.query<R>(sql, params);
	if (!Array.isArray(rows)) throw new Error('the read did not answer rows');
	return rows;
}

/** Every page rule of one workspace, grouped by lower-case page id ('' = workspace-wide). Throws past the limit. */
async function readRules(db: QueryRunner, workspaceId: string): Promise<Map<string, ShareRuleRow[]>> {
	const rows = await rowsOf<ShareRuleRow>(db, RULES_SQL, [workspaceId, MAX_RULES + 1]);
	if (rows.length > MAX_RULES) throw overLimit('rules');
	const rulesByPage = new Map<string, ShareRuleRow[]>();
	for (const rule of rows) {
		const key = lowerId(rule.resource_id);
		const group = rulesByPage.get(key);
		if (group) group.push(rule);
		else rulesByPage.set(key, [rule]);
	}
	return rulesByPage;
}

type ParentRow = { id: string; parent_page_id: string | null; owner_id: string | null; visibility: string | null };

/** The workspace's id -> parent id and id -> owner/visibility maps, every page of it. Throws past the limit: never a partial chain. */
async function readParents(db: QueryRunner, workspaceId: string): Promise<Pick<AccessEntry, 'parentOf' | 'pageMeta'>> {
	const rows = await rowsOf<ParentRow>(db, PARENTS_SQL, [workspaceId, MAX_PAGES + 1]);
	if (rows.length > MAX_PAGES) throw overLimit('pages');
	const parentOf = new Map<string, string | null>();
	const pageMeta = new Map<string, PageMeta>();
	for (const row of rows) {
		const id = lowerId(row.id);
		if (!id) continue;
		parentOf.set(id, row.parent_page_id ? lowerId(row.parent_page_id) : null);
		pageMeta.set(id, { owner_id: row.owner_id ?? null, visibility: row.visibility ?? null });
	}
	return { parentOf, pageMeta };
}

/**
 * The caller's team ids in one workspace, or null when the read cannot be trusted.
 * null is not []: the evaluator reads null as "unknown" and lets a team no_access
 * rule still block, where [] would silently drop the deny the caller is under.
 */
async function readTeamIds(db: QueryRunner, workspaceId: string, userId: string): Promise<string[] | null> {
	try {
		const rows = await rowsOf<{ team_id: string }>(db, TEAMS_SQL, [workspaceId, userId, MAX_TEAMS]);
		// A full answer may be a truncated set: the same fail-closed rule as the other reads.
		return rows.length >= MAX_TEAMS ? null : rows.map((row) => lowerId(row.team_id));
	} catch (error) {
		warnFailedRead(workspaceId, error);
		return null;
	}
}

async function readAttributes(db: QueryRunner, workspaceId: string, userId: string): Promise<{ name: string; value: string }[] | null> {
	try {
		const rows = await rowsOf<{ name: string; value: string }>(db, ATTRIBUTES_SQL, [workspaceId, userId, MAX_ATTRIBUTES + 1]);
		if (rows.length > MAX_ATTRIBUTES) return null;
		return rows.map((row) => ({ name: String(row.name), value: String(row.value) }));
	} catch (error) {
		warnFailedRead(workspaceId, error);
		return null;
	}
}

/** The caller's member row of each workspace in one read (first row wins, as the bridge's limit 1). */
async function readMembers(db: QueryRunner, userId: string, workspaceIds: string[]): Promise<Map<string, WorkspaceMember>> {
	const rows = await rowsOf<{ workspace_id: string; role: string; permissions: unknown }>(db, MEMBERS_SQL, [userId, workspaceIds]);
	const members = new Map<string, WorkspaceMember>();
	for (const row of rows) {
		const key = lowerId(row.workspace_id);
		if (!members.has(key)) members.set(key, { role: row.role, permissions: row.permissions });
	}
	return members;
}

/** The owner id of each workspace in one read. */
async function readOwners(db: QueryRunner, workspaceIds: string[]): Promise<Map<string, string>> {
	const rows = await rowsOf<{ id: string; owner_id: string | null }>(db, OWNERS_SQL, [workspaceIds]);
	const owners = new Map<string, string>();
	for (const row of rows) if (row.owner_id) owners.set(lowerId(row.id), row.owner_id);
	return owners;
}

/** Whether any rule of the workspace targets a team: only then is the team read worth making. */
function namesATeam(rulesByPage: Map<string, ShareRuleRow[]>): boolean {
	for (const rules of rulesByPage.values()) {
		if (rules.some((rule) => rule.target?.type === 'team')) return true;
	}
	return false;
}

function namesAnAttribute(rulesByPage: Map<string, ShareRuleRow[]>): boolean {
	for (const rules of rulesByPage.values()) {
		if (rules.some((rule) => rule.target?.type === 'attribute')) return true;
	}
	return false;
}

/**
 * One workspace's entry, or null when it cannot be read in full. Never throws: the
 * workspace is closed instead. The parent map is read only when a rule exists - with no
 * rule no ancestor can change an answer, and the bridge skips the read the same way.
 */
async function readEntry(db: QueryRunner, userId: string, workspaceId: string, member: WorkspaceMember | null): Promise<AccessEntry | null> {
	try {
		const rulesByPage = await readRules(db, workspaceId);
		const [parents, teamIds, attributes] = await Promise.all([
			rulesByPage.size > 0 ? readParents(db, workspaceId) : { parentOf: null, pageMeta: null },
			member && namesATeam(rulesByPage) ? readTeamIds(db, workspaceId, userId) : null,
			member && namesAnAttribute(rulesByPage) ? readAttributes(db, workspaceId, userId) : null,
		]);
		return { member, rulesByPage, ...parents, teamIds, attributes };
	} catch (error) {
		warnFailedRead(workspaceId, error);
		return null;
	}
}

/**
 * The access maps of the given workspaces for the caller. Never throws: a workspace that
 * cannot be read is absent, and a members or owners read that fails closes all of them.
 * An id that is not a uuid is absent too, so one bad id cannot fail the cast for the rest.
 */
export async function loadAccessMaps(db: QueryRunner, user: Pick<AuthUser, 'userId'>, workspaceIds: readonly string[]): Promise<AccessMaps> {
	const maps: AccessMaps = new Map();
	const ids = [...new Set(workspaceIds.map(lowerId).filter((id) => UUID.test(id)))];
	if (ids.length === 0) return maps;
	let members: Map<string, WorkspaceMember>;
	let owners: Map<string, string>;
	try {
		[members, owners] = await Promise.all([readMembers(db, user.userId, ids), readOwners(db, ids)]);
	} catch (error) {
		warnFailedRead('all', error);
		return maps;
	}
	const entries = await Promise.all(ids.map((id) => {
		const synthetic = sameId(owners.get(id), user.userId) ? { role: 'owner', permissions: [...OWNER_PERMISSIONS] } : null;
		return readEntry(db, user.userId, id, members.get(id) ?? synthetic);
	}));
	ids.forEach((id, index) => {
		const entry = entries[index];
		if (entry) maps.set(id, entry);
	});
	return maps;
}

/**
 * The lower-case ids hidden from the caller by a share rule, for a SQL aggregate's deny set.
 * null fails closed when the workspace's access map is unavailable: the caller may read nothing.
 * Caveat: loadAccessMaps closes the whole workspace past 20,000 pages; one call can pass a uuid[]
 * of up to 20,000 ids, and its reads are not one snapshot with the caller's own read.
 */
export async function ruleHiddenPageIds(db: QueryRunner, user: Pick<AuthUser, 'userId'>, workspaceId: string): Promise<string[] | null> {
	try {
		const maps = await loadAccessMaps(db, user, [workspaceId]);
		const entry = maps.get(lowerId(workspaceId));
		if (!entry) return null;
		if (entry.rulesByPage.size === 0) return [];
		if (!entry.parentOf) return null;
		const hidden = new Set<string>();
		for (const id of entry.parentOf.keys()) {
			const level = pageRuleLevel({ row: { id, workspace_id: workspaceId, owner_id: null }, userId: user.userId, ...entry });
			if (level === 'none') hidden.add(id);
		}
		if (hidden.size > 0) {
			const owned = await rowsOf<{ id: string }>(db, OWNED_PAGES_SQL, [[...hidden], user.userId]);
			for (const row of owned) {
				const id = lowerId(row.id);
				const level = pageRuleLevel({ row: { id, workspace_id: workspaceId, owner_id: user.userId }, userId: user.userId, ...entry });
				if (level !== 'none') hidden.delete(id);
			}
		}
		return [...hidden];
	} catch (error) {
		warnFailedRead(lowerId(workspaceId), error);
		return null;
	}
}

/** The rows the caller may read under the maps: a workspace absent from them is closed, and 'none' is dropped. */
export function filterByRules<T extends { id: string; workspace_id: string }>(rows: readonly T[], user: Pick<AuthUser, 'userId'>, maps: AccessMaps): T[] {
	return rows.filter((row) => {
		const entry = maps.get(lowerId(row.workspace_id));
		return entry !== undefined && pageAccessLevel({ row, userId: user.userId, ...entry }) !== 'none';
	});
}

/** loadAccessMaps for the rows' workspaces, then filterByRules. Any thrown error is [], never the unfiltered rows. */
export async function readableByRules<T extends { id: string; workspace_id: string }>(db: QueryRunner, user: Pick<AuthUser, 'userId'>, rows: readonly T[]): Promise<T[]> {
	if (rows.length === 0) return [];
	try {
		const maps = await loadAccessMaps(db, user, rows.map((row) => row.workspace_id));
		return filterByRules(rows, user, maps);
	} catch (error) {
		warnFailedRead('all', error);
		return [];
	}
}

/**
 * Both checks (member + share rules), fail closed: a page is readable only when
 * both `canReadPageRowAsMember` allows it AND `readableByRules` keeps it.
 * If either check fails, the page is excluded.
 */
export async function canReadPageWithRules(
	db: QueryRunner, userId: string, row: PageAccessRow, workspaces: readonly string[],
): Promise<boolean> {
	if (!canReadPageRowAsMember(row, userId, workspaces)) return false;
	return (await readableByRules(db, { userId }, [row])).length === 1;
}

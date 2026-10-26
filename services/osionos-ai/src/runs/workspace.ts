/**
 * The overview of a workspace for the prompt (plan H1): the pages the caller
 * can read, as a two-level tree with counts, and the ones they touched last.
 *
 * Read LIVE on every run with the retrieval predicate (`pageRowReadableSql`)
 * on pages of a workspace the caller may read (`liveMemberWorkspaces`): a page
 * the caller cannot open is not listed, counted or named, and a workspace they
 * left is not described (the same rule as the workspace name of the account
 * block). Archived pages are out on both levels.
 *
 * Caveat: the overview is a sample, not the workspace. Over `entries` pages
 * the newest win and `truncated` is set; the prompt says so, and content
 * questions still go through search_workspace.
 */
import type { Pool } from 'pg';
import type { AuthUser } from '../auth.ts';
import { liveMemberWorkspaces, pageRowReadableSql } from '../retrieval/acl.ts';

export interface WorkspacePageEntry {
	id: string;
	title: string;
	/** The parent in the overview, when the parent is readable too. */
	parentId: string | null;
	/** The readable children, counted even when they are not listed. */
	childCount: number;
	/** ISO date (day precision is what the block shows). */
	updatedAt: string;
}

export interface WorkspaceOverview {
	workspaceId: string;
	/** Every readable, non-archived page of the workspace. */
	pageCount: number;
	/** Roots first (newest first), then second-level pages, cut at `entries`. */
	tree: WorkspacePageEntry[];
	/** The readable pages updated last, newest first. */
	recent: WorkspacePageEntry[];
	truncated: boolean;
}

export interface WorkspaceOverviewLimits {
	/** The most tree entries listed. */
	entries: number;
	/** The most recent pages listed. */
	recent: number;
}

export const WORKSPACE_OVERVIEW_LIMITS: WorkspaceOverviewLimits = { entries: 60, recent: 5 };

const UNDEFINED_TABLE = '42P01';

interface OverviewRow {
	id: string;
	title: string | null;
	parent_id: string | null;
	child_count: number | string;
	updated_at: Date | string;
	total: number | string;
	depth: number | string;
}

/**
 * One statement: the readable pages of the workspace, then the roots (a page
 * whose parent is null OR unreadable is a root: a shared child of a private
 * parent must not vanish) and their readable children, newest first.
 */
const OVERVIEW_SQL = `
	with readable as (
		select p.id, p.title, p.parent_page_id, p.updated_at
		  from public.osionos_pages p
		 where p.workspace_id = $1::uuid
		   and p.archived_at is null
		   and ${pageRowReadableSql('p', '$2')}
	),
	roots as (
		select r.* from readable r
		 where r.parent_page_id is null
		    or not exists (select 1 from readable q where q.id = r.parent_page_id)
	),
	listed as (
		select r.id, r.title, null::uuid as parent_id, r.updated_at, 0 as depth from roots r
		union all
		select c.id, c.title, c.parent_page_id as parent_id, c.updated_at, 1 as depth
		  from readable c
		 where c.parent_page_id in (select id from roots)
	)
	select l.id, l.title, l.parent_id, l.updated_at, l.depth,
	       (select count(*) from readable k where k.parent_page_id = l.id) as child_count,
	       (select count(*) from readable) as total
	  from listed l
	 order by l.depth asc, l.updated_at desc
	 limit $3`;

// The parent is named only when it is readable too: the id of a private page
// would otherwise leak through its shared child (C101).
const RECENT_SQL = `
	with readable as (
		select p.id, p.title, p.parent_page_id, p.updated_at
		  from public.osionos_pages p
		 where p.workspace_id = $1::uuid
		   and p.archived_at is null
		   and ${pageRowReadableSql('p', '$2')}
	)
	select r.id, r.title, r.updated_at, 0 as depth, 0 as child_count, 0 as total,
	       (select q.id from readable q where q.id = r.parent_page_id) as parent_id
	  from readable r
	 order by r.updated_at desc
	 limit $3`;

function entryOf(row: OverviewRow): WorkspacePageEntry {
	const updated = row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at);
	return {
		id: String(row.id),
		title: row.title ?? 'Untitled',
		parentId: row.parent_id ? String(row.parent_id) : null,
		childCount: Number(row.child_count),
		updatedAt: Number.isNaN(updated.getTime()) ? '' : updated.toISOString(),
	};
}

/**
 * The overview of `workspaceId` as `user` may see it, or null when the caller
 * may not read that workspace at all (C101: nothing says whether it exists).
 * A database without the pages table (a service test without the fixture)
 * reads as an empty workspace, not an error.
 */
export async function loadWorkspaceOverview(
	db: Pool,
	user: AuthUser,
	workspaceId: string,
	limits: WorkspaceOverviewLimits = WORKSPACE_OVERVIEW_LIMITS,
): Promise<WorkspaceOverview | null> {
	const readable = await liveMemberWorkspaces(db, user);
	if (!readable.includes(workspaceId)) return null;
	try {
		const [treeResult, recentResult] = await Promise.all([
			db.query<OverviewRow>(OVERVIEW_SQL, [workspaceId, user.userId, limits.entries]),
			db.query<OverviewRow>(RECENT_SQL, [workspaceId, user.userId, limits.recent]),
		]);
		const total = treeResult.rows.length > 0 ? Number(treeResult.rows[0].total) : 0;
		return {
			workspaceId,
			pageCount: total,
			tree: treeResult.rows.map(entryOf),
			recent: recentResult.rows.map(entryOf),
			truncated: total > treeResult.rows.length,
		};
	} catch (error) {
		if ((error as { code?: unknown } | null)?.code !== UNDEFINED_TABLE) throw error;
		return { workspaceId, pageCount: 0, tree: [], recent: [], truncated: false };
	}
}

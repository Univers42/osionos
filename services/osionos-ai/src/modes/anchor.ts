import type { Pool } from 'pg';
import type { AuthUser } from '../auth.ts';
import { loadAccessMaps } from '../retrieval/shareRules.ts';
import { pageAccessLevel } from '../../../../scripts/bridge-page-access.mjs';

const PAGE_SQL = `select id, workspace_id, owner_id, visibility, collaborators
	from public.osionos_pages
	where id = $1 and workspace_id = $2 and archived_at is null`;

/**
 * Whether the caller may edit the anchor page of an accept_edits conversation.
 *
 * Caveat: the answer is the level at this moment; a share rule changed later
 * is not seen here (the write tools re-check at write time). A workspace the
 * access loader cannot read is closed, so a database fault refuses the anchor.
 */
export async function anchorWritable(db: Pool, user: AuthUser, workspaceId: string, pageId: string): Promise<boolean> {
	const page = (await db.query(PAGE_SQL, [pageId, workspaceId])).rows[0];
	if (!page) return false;
	const entry = (await loadAccessMaps(db, user, [workspaceId])).get(workspaceId.toLowerCase());
	if (!entry) return false;
	const level = pageAccessLevel({ row: page, userId: user.userId, ...entry });
	return level === 'can_edit' || level === 'full_access';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** How many links the climb from a page toward the anchor follows. */
const MAX_DEPTH = 64;

const SUBTREE_SQL = `
with recursive up as (
	select id, parent_page_id, 1 as depth
	from public.osionos_pages where id = $1::uuid and archived_at is null
	union all
	select p.id, p.parent_page_id, up.depth + 1
	from up join public.osionos_pages p on p.id = up.parent_page_id
	where p.archived_at is null and up.depth < ${MAX_DEPTH}
)
select exists (select 1 from up where id = $2::uuid) as inside`;

/**
 * Whether the page is the anchor or lies under it, every link live.
 *
 * Caveat: the depth-64 bound treats a deeper page as outside the anchor, which
 * over-cards (safe). The check reads the live tree at decide time, so a move
 * after the bridge write is not seen. A malformed id is outside.
 */
export async function inAnchorSubtree(db: Pool, pageId: string, anchorId: string): Promise<boolean> {
	if (!UUID.test(pageId) || !UUID.test(anchorId)) return false;
	return (await db.query<{ inside: boolean }>(SUBTREE_SQL, [pageId, anchorId])).rows[0]?.inside === true;
}

/** The workspace a page lives in now; null when it is missing, archived or no uuid. */
export async function liveWorkspaceOf(db: Pool, pageId: string): Promise<string | null> {
	if (!UUID.test(pageId)) return null;
	const rows = await db.query<{ workspace_id: string }>(
		'select workspace_id::text as workspace_id from public.osionos_pages where id = $1::uuid and archived_at is null',
		[pageId],
	);
	return rows.rows[0]?.workspace_id ?? null;
}

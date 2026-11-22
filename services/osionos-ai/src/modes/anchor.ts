import type { Pool } from 'pg';
import type { AuthUser } from '../auth.ts';
import { loadAccessMaps } from '../retrieval/shareRules.ts';
import { pageAccessLevel } from '../../../../scripts/bridge-page-access.mjs';

/**
 * Whether the caller may edit the anchor page of an accept_edits conversation.
 *
 * Caveat: the answer is the level at this moment; a share rule changed later
 * is not seen here (the write tools re-check at write time). A workspace the
 * access loader cannot read is closed, so a database fault refuses the anchor.
 */
const PAGE_SQL = `select id, workspace_id, owner_id, visibility, collaborators
	from public.osionos_pages
	where id = $1 and workspace_id = $2 and archived_at is null`;

export async function anchorWritable(db: Pool, user: AuthUser, workspaceId: string, pageId: string): Promise<boolean> {
	const page = (await db.query(PAGE_SQL, [pageId, workspaceId])).rows[0];
	if (!page) return false;
	const entry = (await loadAccessMaps(db, user, [workspaceId])).get(workspaceId.toLowerCase());
	if (!entry) return false;
	const level = pageAccessLevel({ row: page, userId: user.userId, ...entry });
	return level === 'can_edit' || level === 'full_access';
}

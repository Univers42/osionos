import type { Pool } from 'pg';
import type { AuthUser } from '../auth.ts';
import { liveReadableWorkspaces } from '../../../../scripts/bridge-live-workspaces.mjs';

/**
 * The ACL of the retrieval: the SQL pre-filter of the chunks, and the twin of
 * the bridge's read rule.
 *
 * The chunks carry a COPY of the permissions of their page: the visibility
 * (normalized by ai_page_visibility) and the ids of the collaborators that
 * carry a role (ai_collaborator_ids). The predicate below is the exact twin
 * of canReadPageRowAsMember (scripts/bridge-page-read.mjs), so the copy and
 * the page never disagree about who may read what.
 *
 * It is a PRE-FILTER, never the last word: every page that comes out of it is
 * checked again with the bridge's own function before it is returned, so a
 * stale copy can never leak a page.
 */

/** The caller's user id: the second parameter of the statements below. */
const USER = '$2::uuid';

/**
 * The row predicate: the twin of the row part of canReadPageRowAsMember.
 *
 * The bridge's rule, rule for rule:
 *   - the caller is the owner of the page, or one of its collaborators
 *     (an entry with a non-null role — the chunk carries exactly those ids);
 *   - or the page is 'shared' with its workspace, or 'public'.
 *
 * The visibility is read RAW, and that is the bridge's rule too: the bridge
 * normalizes an unknown visibility (and NULL) to 'private', and 'private' is
 * not one of the two values that open a page. So `visibility in ('shared',
 * 'public')` and `ai_page_visibility(visibility) in ('shared', 'public')`
 * always agree — on every value, normalized or not.
 */
export const ROW_ALLOWED_SQL = `(
	(c.visibility in ('shared', 'public')
	 or c.owner_id = ${USER}
	 or ${USER} = any(c.collaborator_ids))
)`;

/**
 * The workspace predicate: the page must be in a workspace the caller is a
 * member of.
 *
 * The array is the caller's workspaces, read LIVE (see MEMBER_WORKSPACES_SQL):
 * a member row that is deleted is gone at the next query, and never at the
 * next one after that.
 */
export const WORKSPACE_ALLOWED_SQL = `c.workspace_id = any($1::uuid[])`;

/**
 * The workspaces of the caller: the ones the LIVE members table holds for them.
 *
 * The members table is read here, in the query that needs it, and never
 * cached: a membership that ends must end at once. The token's own member
 * list is NOT unioned in: it was minted at login and lives for an hour, so a
 * removed member would keep reading the workspace's private pages until it
 * expired (C98). Only the token's PRIVATE workspace comes from the token; the
 * rest comes from the table, at query time.
 */
export const MEMBER_WORKSPACES_SQL = `
	select m.workspace_id
	from public.osionos_workspace_members m
	where m.user_id = $1::uuid`;

/** The shape of a uuid: the ids that are not uuids can never be one. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The workspaces of the caller, live.
 *
 * The rule is the shared one (scripts/bridge-live-workspaces.mjs): the token's
 * own private workspace, and the live member rows. The scope, when the token
 * carries one, is intersected (C115).
 */
export async function liveMemberWorkspaces(
	db: Pool,
	user: AuthUser,
	scope?: readonly string[] | null,
): Promise<string[]> {
	const result = await db.query<{ workspace_id: string }>(MEMBER_WORKSPACES_SQL, [user.userId]);
	const memberWorkspaces = result.rows
		.map((row) => String(row.workspace_id))
		.filter((id) => UUID.test(id));
	return liveReadableWorkspaces({
		privateWorkspaceId: user.workspaceId,
		memberWorkspaces,
		scope: scope ?? null,
	});
}

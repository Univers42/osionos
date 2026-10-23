import type { Pool, QueryResultRow } from 'pg';
import type { AuthUser } from './auth.ts';

export type WorkspacePermission = 'read' | 'create' | 'update' | 'delete' | 'admin';

interface MemberRow extends QueryResultRow {
	role: string;
	permissions: string[];
}

/**
 * The caller's own row in osionos_workspace_members. The bridge reads the same
 * table for a workspace its token does not carry (scripts/bridge-api.mjs:800-809).
 */
const MEMBER_ROW_SQL = `
	select role, permissions
	from public.osionos_workspace_members
	where workspace_id = $1 and user_id = $2
	limit 1`;

/**
 * The SQL twin of the bridge's requireWorkspaceAccess (scripts/bridge-api.mjs:857-868):
 * the caller's own workspace, or a row of osionos_workspace_members.
 *
 * The permission rule is the bridge's memberHasPermission (scripts/bridge-api.mjs:774-780):
 * the role "owner" or "admin" passes, anybody else needs the permission in the row's
 * permissions array (or the "admin" permission, which passes everything).
 */
export async function canAccessWorkspace(
	db: Pool,
	user: AuthUser,
	workspaceId: string,
	permission: WorkspacePermission = 'read',
): Promise<boolean> {
	// The token's own workspace: the bridge asks the members table for it as well and
	// passes the owner's row with every permission (scripts/bridge-api.mjs:817-834).
	if (user.workspaceId === workspaceId) return true;
	const result = await db.query<MemberRow>(MEMBER_ROW_SQL, [workspaceId, user.userId]);
	const member = result.rows[0];
	if (!member) return false;
	if (member.role === 'owner' || member.role === 'admin') return true;
	const permissions = Array.isArray(member.permissions) ? member.permissions : [];
	return permissions.includes('admin') || permissions.includes(permission);
}

/**
 * canAccessWorkspace without the token's own-workspace shortcut: a session token
 * can be an hour stale, and C138 asks for the members table at request time.
 * Blanking the claim leaves only the live row.
 */
export function canAccessWorkspaceLive(
	db: Pool,
	user: AuthUser,
	workspaceId: string,
	permission: WorkspacePermission,
): Promise<boolean> {
	return canAccessWorkspace(db, { ...user, workspaceId: '' }, workspaceId, permission);
}

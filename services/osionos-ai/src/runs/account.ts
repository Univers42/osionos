import type { Pool } from 'pg';
import type { AuthUser } from '../auth.ts';

/**
 * The account of the caller, for the prompt: who is asking, in which
 * workspace, and in what role.
 *
 * None of these fields is a secret: the display name, the username, the
 * pronouns, the timezone, the workspace name, the role and the flag of the
 * administrator. There is no email, no bio, no location, no other column
 * (devil C202).
 */
export interface AccountContext {
	displayName: string | null;
	username: string | null;
	pronouns: string | null;
	timezone: string | null;
	workspaceName: string | null;
	role: string | null;
	isAdmin: boolean;
}

/** The error code Postgres raises when a relation does not exist. */
const UNDEFINED_TABLE = '42P01';

/** True when the error is the missing-table one. */
function isUndefinedTable(error: unknown): boolean {
	const code = (error as { code?: unknown } | null)?.code;
	return code === UNDEFINED_TABLE;
}

/**
 * The account of the caller, read live.
 *
 * One query on `public.osionos_profiles` for the name fields (and a missing
 * table is not an error: the fields are null), one on `public.osionos_workspaces`
 * for the name of the workspace, and the role is read live from the members
 * table, the way `liveMemberWorkspaces` reads it.
 *
 * The workspace is the run's (its conversation's), not the private one the token
 * names; its name is given only to a live member of it or for the private one.
 */
export async function loadAccountContext(
	db: Pool,
	user: AuthUser,
	workspaceId: string = user.workspaceId,
): Promise<AccountContext> {
	let displayName: string | null = null;
	let username: string | null = null;
	let pronouns: string | null = null;
	let timezone: string | null = null;

	try {
		const result = await db.query<{
			display_name: string | null;
			username: string | null;
			pronouns: string | null;
			timezone: string | null;
		}>('select display_name, username, pronouns, timezone from public.osionos_profiles where user_id = $1', [user.userId]);
		const row = result.rows[0];
		if (row) {
			displayName = row.display_name ?? null;
			username = row.username ?? null;
			pronouns = row.pronouns ?? null;
			timezone = row.timezone ?? null;
		}
	} catch (error) {
		if (!isUndefinedTable(error)) throw error;
	}

	let role: string | null = null;
	try {
		const result = await db.query<{ role: string | null }>(
			'select role from public.osionos_workspace_members where workspace_id = $1::uuid and user_id = $2::uuid limit 1',
			[workspaceId, user.userId],
		);
		role = result.rows[0]?.role ?? null;
	} catch (error) {
		if (!isUndefinedTable(error)) throw error;
	}

	let workspaceName: string | null = null;
	if (role !== null || workspaceId === user.workspaceId) {
		try {
			const result = await db.query<{ name: string | null }>(
				'select name from public.osionos_workspaces where id = $1::uuid limit 1',
				[workspaceId],
			);
			workspaceName = result.rows[0]?.name ?? null;
		} catch (error) {
			if (!isUndefinedTable(error)) throw error;
		}
	}

	return {
		displayName,
		username,
		pronouns,
		timezone,
		workspaceName,
		role,
		isAdmin: user.isAdmin,
	};
}
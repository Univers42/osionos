import type { Pool } from 'pg';
import type { AuthUser } from '../auth.ts';
import { canAccessWorkspaceLive } from '../workspaceAccess.ts';

/**
 * Who may do what with agents: always the live member row (C330).
 *
 * Every gate here goes through `canAccessWorkspaceLive`, which ignores the
 * token's own-workspace claim. A session token can be an hour stale and a
 * member can be demoted or removed in that hour.
 *
 * Agent code never imports `liveMemberWorkspaces` (it admits the token's
 * private workspace without a member row) or `authorityIn` (a different rule,
 * C331). tests/agentsAuthority.test.ts reads the sources to hold that.
 */

/** Read or list the agents of a workspace. */
export function canReadAgents(db: Pool, user: AuthUser, workspaceId: string): Promise<boolean> {
	return canAccessWorkspaceLive(db, user, workspaceId, 'read');
}

/** Run an agent in a workspace. */
export function canRunAgents(db: Pool, user: AuthUser, workspaceId: string): Promise<boolean> {
	return canAccessWorkspaceLive(db, user, workspaceId, 'create');
}

/** Write a workspace agent or the workspace switches. */
export function canAdminAgents(db: Pool, user: AuthUser, workspaceId: string): Promise<boolean> {
	return canAccessWorkspaceLive(db, user, workspaceId, 'admin');
}

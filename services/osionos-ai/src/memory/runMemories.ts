import type { Pool } from 'pg';
import type { AuthUser } from '../auth.ts';
import { liveMemberWorkspaces } from '../retrieval/acl.ts';
import { approvedForRun } from './repo.ts';
import type { RunMemory } from './repo.ts';

/**
 * The memories one run puts in its user turn: the caller's own approved
 * memories of the conversation's workspace, and only while the caller is a LIVE
 * member of it. A failure reading them is logged and the run goes on without
 * them — it never fails because of user data.
 */
export async function memoriesForRun(
	db: Pool,
	user: AuthUser | undefined,
	workspaceId: string | undefined,
): Promise<RunMemory[]> {
	if (!user || !workspaceId) return [];
	try {
		const live = await liveMemberWorkspaces(db, user);
		return live.includes(workspaceId) ? await approvedForRun(db, { userId: user.userId, workspaceId }) : [];
	} catch (error) {
		const code = error instanceof Error ? error.message : 'memories_failed';
		console.warn(JSON.stringify({ event: 'run_memories_failed', code }));
		return [];
	}
}

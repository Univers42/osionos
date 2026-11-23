import type { Pool } from 'pg';
import type { AuthUser } from '../auth.ts';
import { markProvenanceTaint } from './repo.ts';
import type { TaintReason } from './repo.ts';
import { readContent } from './readIds.ts';
import { logTaintFailure } from './runStart.ts';
import { untrustedPageIds, writtenOnlyBy } from './trust.ts';

async function workspaceSkillIsForeign(db: Pool, user: AuthUser, slug: string): Promise<boolean> {
	const row = await db.query<{ created_by: string; updated_by: string }>(
		'select created_by::text, updated_by::text from public.ai_skills where workspace_id = $1 and slug = $2 and archived_at is null',
		[user.workspaceId, slug],
	);
	// No row: not vouched for.
	const found = row.rows[0];
	return !found || !writtenOnlyBy(user.userId, found.created_by, found.updated_by);
}

async function reasonFor(db: Pool, user: AuthUser, tool: string, data: unknown): Promise<TaintReason | null> {
	const content = readContent(tool, data);
	if (content === 'none') return null;
	if (content === 'untrusted') return 'untrusted_tool';
	if ('skill' in content) {
		const { source, slug } = content.skill;
		return source === 'workspace' && (await workspaceSkillIsForeign(db, user, slug)) ? 'foreign_skill' : null;
	}
	if ((await untrustedPageIds(db, user, content.pageIds)).length === 0) return null;
	return tool === 'graph_neighbors' ? 'shared_title' : 'shared_page';
}

/**
 * The hook a tool set awaits before a tool result reaches the model: taints
 * the conversation when the tool read content the user cannot vouch for.
 *
 * Fail closed: a check that throws taints 'legacy' and logs only a code; a
 * failing taint write propagates, so the model never sees the result.
 *
 * Caveat: page trust is today's ACL (`untrustedPageIds`), and a workspace skill
 * is looked up by slug in the user's workspace, so a skill edited after the run
 * listed it is judged by its current row. 'legacy' over-reports.
 */
export function makeOnRead(db: Pool, user: AuthUser, conversationId: string): (tool: string, data: unknown) => Promise<void> {
	return async (tool, data) => {
		let reason: TaintReason | null;
		try {
			reason = await reasonFor(db, user, tool, data);
		} catch (error) {
			logTaintFailure(error);
			reason = 'legacy';
		}
		if (reason) await markProvenanceTaint(db, conversationId, reason);
	};
}

import type { Pool } from 'pg';
import type { AuthUser } from '../auth.ts';
import { canReadAgents, canRunAgents } from '../agents/authority.ts';
import { getAgent, listAgents } from '../agents/repo.ts';
import type { StoredAgent } from '../agents/repo.ts';
import { needsReview } from '../agents/resolve.ts';
import { sendError, sendJson } from '../http.ts';
import { requireUser, UUID } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The reads of custom agents: the part of GET /api/ai/agents after the
 * built-ins, and GET /api/ai/agents/:id.
 *
 * The list never carries instructions (C332). GET one carries them only for
 * the owner, and for a live member who may run a workspace agent (C300).
 */

/** An agent as the client sees it. */
export function agentView(agent: StoredAgent, extra: { needsReview: boolean; instructions: boolean }) {
	return {
		kind: 'custom' as const,
		id: agent.id,
		scope: agent.scope,
		workspaceId: agent.workspace_id,
		name: agent.name,
		description: agent.description,
		tools: agent.tools,
		skills: agent.skills,
		version: agent.version,
		archived: agent.archived_at !== null,
		needsReview: extra.needsReview,
		...(extra.instructions ? { instructions: agent.instructions } : {}),
	};
}

/** The workspaces the caller has a member row in. The row is only a candidate list: canReadAgents decides. */
async function memberWorkspaceIds(db: Pool, user: AuthUser): Promise<string[]> {
	const result = await db.query<{ workspace_id: string }>(
		'select workspace_id from public.osionos_workspace_members where user_id = $1 limit 100',
		[user.userId],
	);
	const checks = await Promise.all(result.rows.map((row) => canReadAgents(db, user, row.workspace_id)));
	return result.rows.filter((_, index) => checks[index]).map((row) => row.workspace_id);
}

/** The custom agents the caller may see: their own, and the workspaces' they live-read. */
export async function listCustomViews(db: Pool, user: AuthUser) {
	const agents = await listAgents(db, user.userId, await memberWorkspaceIds(db, user));
	const reviewed = new Map<string, boolean>();
	const views = [];
	for (const agent of agents) {
		const key = `${agent.workspace_id}:${agent.updated_by}`;
		if (agent.scope === 'workspace' && !reviewed.has(key)) reviewed.set(key, await needsReview(db, agent, agent.updated_by));
		views.push(agentView(agent, { needsReview: reviewed.get(key) ?? false, instructions: false }));
	}
	return views;
}

/** GET /api/ai/agents/:id */
export async function handleAgentGet(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const id = ctx.params[0] ?? '';
	const agent = UUID.test(id) ? await getAgent(ctx.deps.db, id) : null;
	const workspaceId = agent?.workspace_id ?? '';
	const visible =
		agent !== null &&
		(agent.scope === 'user' ? agent.owner_id === user.userId : await canReadAgents(ctx.deps.db, user, workspaceId));
	if (!agent || !visible) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const mayRun = agent.scope === 'user' || (await canRunAgents(ctx.deps.db, user, workspaceId));
	const review = await needsReview(ctx.deps.db, agent, agent.updated_by);
	sendJson(ctx.response, 200, agentView(agent, { needsReview: review, instructions: mayRun }));
	return 200;
}

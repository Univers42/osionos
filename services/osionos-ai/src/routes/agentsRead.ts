import type { Pool } from 'pg';
import type { AuthUser } from '../auth.ts';
import { canAdminAgents, canReadAgents, canRunAgents } from '../agents/authority.ts';
import { getAgent, listAgents } from '../agents/repo.ts';
import type { StoredAgent } from '../agents/repo.ts';
import { needsReview } from '../agents/resolve.ts';
import { readAgentSettings } from '../agents/settings.ts';
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

/**
 * The workspaces whose agents the caller may read: the ones they have a member
 * row in, or only `only` — none for `null`. A candidate is never enough:
 * canReadAgents decides.
 */
async function readableWorkspaceIds(db: Pool, user: AuthUser, only?: string | null): Promise<string[]> {
	if (only === null) return [];
	const candidates = only
		? [only]
		: (
				await db.query<{ workspace_id: string }>(
					'select workspace_id from public.osionos_workspace_members where user_id = $1 limit 100',
					[user.userId],
				)
			).rows.map((row) => row.workspace_id);
	const checks = await Promise.all(candidates.map((workspaceId) => canReadAgents(db, user, workspaceId)));
	return candidates.filter((_, index) => checks[index]);
}

/**
 * The custom agents the caller may see: their own, and the workspaces' they
 * live-read — or, with `only`, that one workspace's, and with `null` none
 * (`list_my_context`, C1143).
 */
export async function listCustomViews(db: Pool, user: AuthUser, only?: string | null) {
	const agents = await listAgents(db, user.userId, await readableWorkspaceIds(db, user, only));
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
	const review = await needsReview(ctx.deps.db, agent, agent.updated_by);
	const instructions = agent.scope === 'user' || (await mayReadInstructions(ctx.deps.db, user, workspaceId, review));
	sendJson(ctx.response, 200, agentView(agent, { needsReview: review, instructions }));
	return 200;
}

/**
 * Who reads the instructions of a workspace agent (C300): its live admins, who
 * write and review it, and whoever may run it now. A member does not read an
 * agent nobody may run: one that needs review, or in a workspace whose agents
 * are off.
 */
async function mayReadInstructions(db: Pool, user: AuthUser, workspaceId: string, review: boolean): Promise<boolean> {
	if (await canAdminAgents(db, user, workspaceId)) return true;
	if (review || !(await readAgentSettings(db, workspaceId)).agents_enabled) return false;
	return canRunAgents(db, user, workspaceId);
}

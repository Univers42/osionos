import { z } from 'zod';
import type { AuthUser } from '../auth.ts';
import { canAdminAgents, canReadAgents } from '../agents/authority.ts';
import { archiveAgent, createAgent, getAgent, updateAgent } from '../agents/repo.ts';
import type { AgentFields, ChangeOutcome, StoredAgent } from '../agents/repo.ts';
import { createAgentSchema, fieldsRefusal, uniqueNames, updateAgentSchema } from '../agents/validate.ts';
import { readJson, sendError, sendJson, sendNoContent } from '../http.ts';
import { checkRateLimit } from '../rateLimit.ts';
import { agentView } from './agentsRead.ts';
import { requireUser, UUID } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The writes of custom agents: POST /api/ai/agents, PATCH|DELETE /api/ai/agents/:id.
 *
 * A user-scope agent is written by its owner; a workspace agent only by a live
 * admin (C296). Every refusal of a body is 422 (C332); every write is limited
 * to 20 a minute per user (C319).
 */

const WRITES_PER_MINUTE = 20;
const RATE_PREFIX = 'ai:rl:agent';

function refuse(ctx: RouteContext, status: number, code: string): number {
	sendError(ctx.response, status, code);
	return status;
}

/** The body, or a 422: a key the agent does not have is as wrong as a bad value. */
async function readBody<T>(ctx: RouteContext, schema: z.ZodType<T>): Promise<{ ok: true; body: T } | { ok: false }> {
	const raw = await readJson(ctx.request, z.unknown());
	const parsed = schema.safeParse(raw);
	return parsed.success ? { ok: true, body: parsed.data } : { ok: false };
}

async function writeAllowed(ctx: RouteContext, userId: string): Promise<boolean> {
	const rate = await checkRateLimit(ctx.deps.redis, userId, WRITES_PER_MINUTE, new Date(), RATE_PREFIX);
	if (!rate.allowed) ctx.response.setHeader('retry-after', String(rate.retryAfterSeconds));
	return rate.allowed;
}

/** POST /api/ai/agents */
export async function handleAgentCreate(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const read = await readBody(ctx, createAgentSchema);
	if (!read.ok) return refuse(ctx, 422, 'invalid_request');
	const { scope, workspaceId, ...rest } = read.body;
	if ((scope === 'workspace') !== (workspaceId !== undefined)) return refuse(ctx, 422, 'invalid_request');
	if (scope === 'workspace' && !(await canAdminAgents(ctx.deps.db, user, workspaceId as string))) {
		return refuse(ctx, 403, 'forbidden');
	}
	const fields: AgentFields = { ...rest, tools: uniqueNames(rest.tools) };
	const refusal = fieldsRefusal(fields, scope);
	if (refusal) return refuse(ctx, 422, refusal);
	if (!(await writeAllowed(ctx, user.userId))) return refuse(ctx, 429, 'rate_limited');
	const outcome = await createAgent(ctx.deps.db, {
		...fields,
		scope,
		ownerId: scope === 'user' ? user.userId : null,
		workspaceId: workspaceId ?? null,
		actorId: user.userId,
	});
	if (outcome.kind === 'limit') return refuse(ctx, 409, 'agent_limit');
	sendJson(ctx.response, 201, agentView(outcome.agent, { needsReview: false, instructions: true }));
	return 201;
}

/** The agent the caller may change, or a refusal already written: 404 for a stranger, 403 for a non-admin, 409 archived. */
async function writableAgent(ctx: RouteContext, user: AuthUser): Promise<StoredAgent | number> {
	const userId = user.userId;
	const id = ctx.params[0] ?? '';
	const agent = UUID.test(id) ? await getAgent(ctx.deps.db, id) : null;
	if (!agent) return refuse(ctx, 404, 'not_found');
	if (agent.scope === 'user') {
		if (agent.owner_id !== userId) return refuse(ctx, 404, 'not_found');
	} else {
		const workspaceId = agent.workspace_id as string;
		if (!(await canReadAgents(ctx.deps.db, user, workspaceId))) return refuse(ctx, 404, 'not_found');
		if (!(await canAdminAgents(ctx.deps.db, user, workspaceId))) return refuse(ctx, 403, 'forbidden');
	}
	if (agent.archived_at !== null) return refuse(ctx, 409, 'agent_archived');
	return agent;
}

function answerChange(ctx: RouteContext, outcome: ChangeOutcome): number {
	if (outcome.kind === 'missing') return refuse(ctx, 404, 'not_found');
	if (outcome.kind === 'archived') return refuse(ctx, 409, 'agent_archived');
	if (outcome.kind === 'conflict') return refuse(ctx, 409, 'version_conflict');
	sendJson(ctx.response, 200, agentView(outcome.agent, { needsReview: false, instructions: true }));
	return 200;
}

/** PATCH /api/ai/agents/:id */
export async function handleAgentUpdate(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const agent = await writableAgent(ctx, user);
	if (typeof agent === 'number') return agent;
	const read = await readBody(ctx, updateAgentSchema);
	if (!read.ok) return refuse(ctx, 422, 'invalid_request');
	const { expectedVersion, ...changes } = read.body;
	if (agent.version !== expectedVersion) return refuse(ctx, 409, 'version_conflict');
	const fields: AgentFields = {
		name: changes.name ?? agent.name,
		description: changes.description ?? agent.description,
		instructions: changes.instructions ?? agent.instructions,
		tools: uniqueNames(changes.tools ?? agent.tools),
		skills: changes.skills ?? agent.skills,
	};
	const refusal = fieldsRefusal(fields, agent.scope);
	if (refusal) return refuse(ctx, 422, refusal);
	if (!(await writeAllowed(ctx, user.userId))) return refuse(ctx, 429, 'rate_limited');
	return answerChange(ctx, await updateAgent(ctx.deps.db, { id: agent.id, expectedVersion, fields, actorId: user.userId }));
}

/** DELETE /api/ai/agents/:id: archives; the row and its versions stay for the runs that pinned them. */
export async function handleAgentArchive(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const agent = await writableAgent(ctx, user);
	if (typeof agent === 'number') return agent;
	if (!(await writeAllowed(ctx, user.userId))) return refuse(ctx, 429, 'rate_limited');
	const outcome = await archiveAgent(ctx.deps.db, { id: agent.id, actorId: user.userId });
	if (outcome.kind !== 'changed') return answerChange(ctx, outcome);
	sendNoContent(ctx.response);
	return 204;
}

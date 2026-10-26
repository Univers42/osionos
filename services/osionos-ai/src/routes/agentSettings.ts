import { readAgentSettings, writeAgentSettings } from '../agents/settings.ts';
import { settingsSchema } from '../agents/validate.ts';
import { canAdminAgents, canReadAgents } from '../agents/authority.ts';
import { readJson, sendError, sendJson } from '../http.ts';
import { requireUser, UUID } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The switches of a workspace for custom agents (C305): the server decides,
 * never the client store. Mirrors the sentiment switch.
 *
 * GET|PUT /api/ai/workspaces/:ws/agents/settings
 */
export async function handleAgentSettings(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const workspaceId = ctx.params[0] ?? '';
	if (!UUID.test(workspaceId)) {
		sendError(ctx.response, 400, 'invalid_request');
		return 400;
	}
	const method = ctx.request.method ?? '';
	if (method !== 'GET' && method !== 'PUT') {
		sendError(ctx.response, 405, 'method_not_allowed');
		return 405;
	}
	// Not a live reader: 404, so the existence of a workspace does not leak.
	if (!(await canReadAgents(ctx.deps.db, user, workspaceId))) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	if (method === 'GET') {
		sendJson(ctx.response, 200, await readAgentSettings(ctx.deps.db, workspaceId));
		return 200;
	}
	const body = await readJson(ctx.request, settingsSchema);
	if (!(await canAdminAgents(ctx.deps.db, user, workspaceId))) {
		sendError(ctx.response, 403, 'forbidden');
		return 403;
	}
	await writeAgentSettings(ctx.deps.db, { ...body, workspaceId, actorId: user.userId });
	sendJson(ctx.response, 200, body);
	return 200;
}

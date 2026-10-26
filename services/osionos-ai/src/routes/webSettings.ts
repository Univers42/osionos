import { z } from 'zod';
import { config } from '../config.ts';
import { readJson, sendError, sendJson } from '../http.ts';
import { canAccessWorkspaceLive } from '../workspaceAccess.ts';
import { readWorkspaceWeb, writeWorkspaceWeb } from '../web/settings.ts';
import { isFreshSession, requireUser, UUID } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The switch "Allow web access" of a workspace (web C370, C357).
 *
 * GET|PUT /api/ai/workspaces/:ws/web/settings — the route exists only while
 * OSIONOS_AI_WEB is on (C369). A reader sees the value; only an owner or an
 * admin of the live member table flips it, from a session younger than ten
 * minutes, and only with `acknowledged: true`: the client showed the
 * disclosure that queries and fetched pages go to third parties.
 *
 * `research: true` is added only while OSIONOS_AI_RESEARCH is on and a SearXNG
 * is configured, so the client offers the Research toggle (C414); with the
 * flag off the body is unchanged (C415).
 */

/** How fresh a session must be to flip the switch: a stolen hour-old session cannot. */
const FRESH_WINDOW_MS = 10 * 60 * 1000;

const putSchema = z.object({ enabled: z.boolean(), acknowledged: z.literal(true) }).strict();

export async function handleWebSettings(ctx: RouteContext): Promise<number> {
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
	if (!(await canAccessWorkspaceLive(ctx.deps.db, user, workspaceId, 'read'))) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	if (method === 'GET') {
		const enabled = await readWorkspaceWeb(ctx.deps.db, workspaceId);
		sendJson(ctx.response, 200, config.researchEnabled && config.searxngUrl ? { enabled, research: true } : { enabled });
		return 200;
	}
	const body = await readJson(ctx.request, putSchema);
	if (!(await canAccessWorkspaceLive(ctx.deps.db, user, workspaceId, 'admin'))) {
		sendError(ctx.response, 403, 'forbidden');
		return 403;
	}
	if (!isFreshSession(user, FRESH_WINDOW_MS)) {
		sendError(ctx.response, 403, 'reauth_required');
		return 403;
	}
	await writeWorkspaceWeb(ctx.deps.db, { workspaceId, actorId: user.userId, enabled: body.enabled });
	sendJson(ctx.response, 200, { enabled: body.enabled });
	return 200;
}

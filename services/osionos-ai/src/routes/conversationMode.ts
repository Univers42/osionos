import { z } from 'zod';
import type { AuthUser } from '../auth.ts';
import { config } from '../config.ts';
import { getOwnedConversation } from '../conversations/repo.ts';
import { readJson, sendError, sendJson } from '../http.ts';
import { anchorWritable } from '../modes/anchor.ts';
import { readConversationMode, writeConversationMode } from '../modes/mode.ts';
import { modesAllowed } from '../modes/modesConfig.ts';
import { checkRunRateLimit } from '../rateLimit.ts';
import { isFreshSession, requireUser, UUID } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * GET and PATCH /api/ai/conversations/:id/mode (AM10, AM11, AM18).
 *
 * A conversation that is not the caller's is a 404; a body that names any
 * other mode (bypass included) is a 400.
 */
const modeBody = z
	.object({ mode: z.enum(['manual', 'plan', 'accept_edits', 'auto']), anchorPageId: z.string().regex(UUID).optional() })
	.strict();

/**
 * Ten minutes: the same freshness as a token mint. Caveat: it is measured from
 * the session's issue time, so a human who signed in 9 minutes ago and walked
 * away still passes.
 */
const FRESH_WINDOW_MS = 10 * 60 * 1000;

function refuse(ctx: RouteContext, status: number, code: string): number {
	sendError(ctx.response, status, code);
	return status;
}

/** The refusal of a write to a mode this caller may not hold, or null. */
function modeRefusal(user: AuthUser, body: z.infer<typeof modeBody>): { status: number; code: string } | null {
	if (body.anchorPageId !== undefined && body.mode !== 'accept_edits') return { status: 400, code: 'anchor_not_allowed' };
	if (body.mode === 'manual') return null;
	if (!modesAllowed(config, user.userId)) return { status: 403, code: 'modes_not_enabled' };
	const writes = body.mode === 'accept_edits' || body.mode === 'auto';
	return writes && !isFreshSession(user, FRESH_WINDOW_MS) ? { status: 403, code: 'reauth_required' } : null;
}

async function patchMode(ctx: RouteContext, user: AuthUser, id: string, workspaceId: string): Promise<number> {
	const body = await readJson(ctx.request, modeBody);
	const refusal = modeRefusal(user, body);
	if (refusal) return refuse(ctx, refusal.status, refusal.code);
	const anchor = body.anchorPageId ?? null;
	if (body.mode === 'accept_edits' && (anchor === null || !(await anchorWritable(ctx.deps.db, user, workspaceId, anchor)))) {
		return refuse(ctx, 422, 'anchor_invalid');
	}
	const stored = { mode: body.mode, anchorPageId: anchor };
	if (!(await writeConversationMode(ctx.deps.db, id, user.userId, stored))) return refuse(ctx, 404, 'not_found');
	sendJson(ctx.response, 200, stored);
	return 200;
}

export async function handleConversationMode(ctx: RouteContext): Promise<number> {
	// Flag first: off, even an anonymous caller must not learn the route exists.
	if (!config.modesEnabled) return refuse(ctx, 404, 'not_found');
	const user = requireUser(ctx);
	if (!user) return 401;
	if (user.scope !== undefined) return refuse(ctx, 403, 'forbidden');
	const rate = await checkRunRateLimit(ctx.deps.redis, user.userId, config.runsPerMinute);
	if (!rate.allowed) return refuse(ctx, 429, 'rate_limited');
	const id = ctx.params[0] ?? '';
	const owned = UUID.test(id) ? await getOwnedConversation(ctx.deps.db, { id, ownerId: user.userId }) : null;
	if (!owned) return refuse(ctx, 404, 'not_found');
	if (ctx.request.method === 'PATCH') return patchMode(ctx, user, id, owned.workspace_id);
	sendJson(ctx.response, 200, await readConversationMode(ctx.deps.db, id, user.userId));
	return 200;
}

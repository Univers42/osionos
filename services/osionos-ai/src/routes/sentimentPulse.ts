import { sendError, sendJson } from '../http.ts';
import { readPulse, readThreadMood } from '../sentiment/pulse.ts';
import { canAccessWorkspaceLive } from '../workspaceAccess.ts';
import { requireUser, UUID } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The two read surfaces of AI sentiment (M6): the workspace Pulse and the
 * thread mood. Both answer aggregates only (C140).
 */

const DEFAULT_WEEKS = 12;

/** GET /api/ai/workspaces/:workspaceId/sentiment/pulse?weeks=N */
export async function handleSentimentPulse(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const workspaceId = ctx.params[0] ?? '';
	const raw = ctx.url.searchParams.get('weeks');
	const weeks = raw === null ? DEFAULT_WEEKS : /^\d{1,2}$/.test(raw) ? Number(raw) : 0;
	if (!UUID.test(workspaceId) || weeks < 1 || weeks > 52) {
		sendError(ctx.response, 400, 'invalid_request');
		return 400;
	}
	if (!(await canAccessWorkspaceLive(ctx.deps.db, user, workspaceId, 'read'))) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	sendJson(ctx.response, 200, await readPulse(ctx.deps.db, user, workspaceId, weeks));
	return 200;
}

/** GET /api/ai/pages/:pageId/sentiment/mood */
export async function handleSentimentMood(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const pageId = ctx.params[0] ?? '';
	if (!UUID.test(pageId)) {
		sendError(ctx.response, 400, 'invalid_request');
		return 400;
	}
	const mood = await readThreadMood(ctx.deps.db, user, pageId);
	if (!mood) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	sendJson(ctx.response, 200, mood);
	return 200;
}

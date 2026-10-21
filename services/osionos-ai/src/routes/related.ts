import { config } from '../config.ts';
import { sendError, sendJson } from '../http.ts';
import { checkRelatedRateLimit } from '../rateLimit.ts';
import { relatedLimit, relatedPages } from '../retrieval/related.ts';
import { requireUser, UUID } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The related pages of a page: what a reader may find next.
 *
 * The neighbours are computed for the CALLER, at read time (C102): a page the
 * caller may not read is not a neighbour, and it is not a "missing" one
 * either — the answer is simply the caller's own.
 */

/** GET /api/ai/pages/:id/related?k=8 */
export async function handleRelated(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const pageId = ctx.params[0] ?? '';
	if (!UUID.test(pageId)) {
		// A page that does not exist and a page the caller may not read answer
		// the same, byte for byte (C101).
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	// The related read is a kNN over the vectors of a workspace: the most
	// expensive read of the service. It has its OWN window (its own counter,
	// the same limiter), so a client that hammers it cannot spend the budget
	// of the runs.
	const rate = await checkRelatedRateLimit(ctx.deps.redis, user.userId, config.relatedPerMinute);
	if (!rate.allowed) {
		sendError(ctx.response, 429, 'rate_limited');
		return 429;
	}
	const limit = relatedLimit(ctx.url.searchParams.get('k'));
	const related = await relatedPages(ctx.deps.db, user, pageId, limit);
	if (related === null) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const status = 200;
	sendJson(ctx.response, status, { related });
	return status;
}

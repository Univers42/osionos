import { z } from 'zod';
import { config } from '../config.ts';
import { sendError, sendJson, readJson } from '../http.ts';
import { checkSourcesRateLimit } from '../rateLimit.ts';
import { retrieve, DEFAULT_LIMIT } from '../retrieval/search.ts';
import { requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The sources of a question, for a run that happens on the user's device.
 *
 * A "This device" connection runs the model in the user's browser against
 * their own engine; only the sources come from our server. This route is the
 * one a device run needs, on the SAME access path as a server run: live
 * membership plus the `canReadPageRowAsMember` re-check inside `retrieve`.
 * It returns what a run would have quoted, so it adds no read the caller
 * could not already do, but it lets a client search without spending model
 * budget; the per-minute window is the only brake.
 */

const bodySchema = z
	.object({
		query: z.string().trim().min(1).max(2000),
		limit: z.number().int().min(1).max(20).optional(),
	})
	.strict();

export async function handleSources(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;

	// The rate window comes before the body is read and before any embedding:
	// a client that hammers this route cannot spend the budget of the runs.
	const rate = await checkSourcesRateLimit(ctx.deps.redis, user.userId, config.sourcesPerMinute);
	if (!rate.allowed) {
		sendError(ctx.response, 429, 'rate_limited');
		return 429;
	}

	const body = await readJson(ctx.request, bodySchema);

	const sources = await retrieve(ctx.deps.db, user, {
		query: body.query,
		limit: body.limit ?? DEFAULT_LIMIT,
	});

	// Build each item with an explicit object literal of the six fields, so a
	// field added to RetrievedChunk later does not leak through this route.
	const items = sources.map((chunk) => ({
		pageId: chunk.pageId,
		blockId: chunk.blockId,
		title: chunk.title,
		headingPath: chunk.headingPath,
		snippet: chunk.snippet,
		score: chunk.score,
	}));

	const status = 200;
	sendJson(ctx.response, status, { sources: items });
	return status;
}

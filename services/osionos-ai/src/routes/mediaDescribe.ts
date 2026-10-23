import { z } from 'zod';
import { config } from '../config.ts';
import { bearerToken } from '../auth.ts';
import { readJson, sendError, sendJson } from '../http.ts';
import { describeImage } from '../media/describe.ts';
import { checkRateLimit, DESCRIBE_LIMIT_PREFIX } from '../rateLimit.ts';
import { MEDIA_CAPABILITY_PATH } from '../vision/fetchAttachment.ts';
import { requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * `POST /api/ai/media/describe` `{ path }` — alt text, tags, objects and the
 * text of ONE picture, on the reader's request, with the reader's session.
 * Off (no VLM URL) the route is an unknown route.
 */
const bodySchema = z.object({ path: z.string().regex(MEDIA_CAPABILITY_PATH) }).strict();

export async function handleMediaDescribe(ctx: RouteContext): Promise<number> {
	if (!config.vlmUrl) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const user = requireUser(ctx);
	if (!user) return 401;
	const body = await readJson(ctx.request, bodySchema);

	// Before the bytes are fetched: a refused call costs the bridge nothing.
	const window = await checkRateLimit(ctx.deps.redis, user.userId, config.describePerMinute, new Date(), DESCRIBE_LIMIT_PREFIX);
	if (!window.allowed) {
		ctx.response.setHeader('retry-after', String(window.retryAfterSeconds));
		sendError(ctx.response, 429, 'rate_limited');
		return 429;
	}
	try {
		const description = await describeImage({ db: ctx.deps.db, token: bearerToken(ctx.request) ?? '' }, body);
		sendJson(ctx.response, 200, description);
		return 200;
	} catch (error) {
		const failure = error as { status?: unknown; code?: unknown; retryAfterSeconds?: unknown };
		if (typeof failure.status !== 'number' || typeof failure.code !== 'string') throw error;
		if (typeof failure.retryAfterSeconds === 'number') ctx.response.setHeader('retry-after', String(failure.retryAfterSeconds));
		sendError(ctx.response, failure.status, failure.code);
		return failure.status;
	}
}

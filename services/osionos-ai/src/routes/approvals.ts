import { z } from 'zod';
import { readJson, sendError, sendJson } from '../http.ts';
import { checkRunRateLimit } from '../rateLimit.ts';
import { config } from '../config.ts';
import { bearerToken } from '../auth.ts';
import { getOwnedApproval } from '../approvals/repo.ts';
import { describeApproval } from '../approvals/describe.ts';
import { decideApproval } from '../approvals/execute.ts';
import { UUID, requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The approvals: the card a client draws, and the decision a user takes.
 *
 * The GET is the recovery path: the event stream of a run lives fifteen
 * minutes, and a client that comes back later finds the approval in the
 * database. The answer is the DATA of the card — the tool in words, the
 * target by name, the arguments verbatim, and the preview.
 *
 * The POST is the decision. The body is exactly `{decision}`: anything else
 * is a 400, because a body that carries more than a decision is a body that
 * tries to be an argument.
 *
 * An approval of somebody else does not exist for the caller: a 404, never a
 * 403.
 */

/** The body of a decision: the decision, and nothing else. */
const decisionSchema = z.object({ decision: z.enum(['approve', 'decline']) }).strict();

/** GET /api/ai/approvals/:id */
export async function handleApprovalGet(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const id = ctx.params[0] ?? '';
	if (!UUID.test(id)) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const row = await getOwnedApproval(ctx.deps.db, { id, ownerId: user.userId });
	if (!row) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const description = await describeApproval(ctx.deps.db, user, row);
	sendJson(ctx.response, 200, description);
	return 200;
}

/** POST /api/ai/approvals/:id */
export async function handleApprovalDecision(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	// The decisions are rate-limited like the runs: they cost a write.
	const rate = await checkRunRateLimit(ctx.deps.redis, user.userId, config.runsPerMinute);
	if (!rate.allowed) {
		sendError(ctx.response, 429, 'rate_limited');
		return 429;
	}
	const id = ctx.params[0] ?? '';
	if (!UUID.test(id)) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const body = await readJson(ctx.request, decisionSchema);
	// The token of THIS request is the one the write goes out with. It is read
	// here, used here, and nowhere else: it is never stored and never logged.
	const sessionToken = bearerToken(ctx.request);
	if (!sessionToken) {
		sendError(ctx.response, 401, 'unauthorized');
		return 401;
	}
	const outcome = await decideApproval({
		db: ctx.deps.db,
		redis: ctx.deps.redis,
		user,
		sessionToken,
		approvalId: id,
		decision: body.decision,
	});
	if (outcome.kind === 'refused') {
		sendError(ctx.response, outcome.status, outcome.code);
		return outcome.status;
	}
	sendJson(ctx.response, 200, {
		ok: true,
		approvalId: outcome.approval.id,
		status: outcome.status,
		result: outcome.result ?? null,
		error: outcome.approval.error ?? null,
		continuationRunId: outcome.continuationRunId ?? null,
	});
	return 200;
}

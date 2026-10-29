import { z } from 'zod';
import { readJson, sendError, sendJson } from '../http.ts';
import { checkDailyBuildLimit, checkRunRateLimit } from '../rateLimit.ts';
import { config } from '../config.ts';
import { bearerToken } from '../auth.ts';
import { getOwnedApproval, listPendingMcpApprovals } from '../approvals/repo.ts';
import { describeApproval } from '../approvals/describe.ts';
import { decideApproval } from '../approvals/execute.ts';
import { claimPartial, recordOutcome } from '../approvals/repo.ts';
import { revalidateStoredPlan } from '../builders/plan.ts';
import { executePlan } from '../builders/execute.ts';
import { donePageItems } from '../builders/items.ts';
import { undoBuild } from '../builders/undo.ts';
import { hookRefusal } from '../context/hooks.ts';
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
const decisionSchema = z.object({ decision: z.enum(['approve', 'decline']), items: z.array(z.string().min(1).max(40)).max(40).optional() }).strict();

/**
 * GET /api/ai/approvals?origin=mcp
 *
 * The MCP writes of the caller that still wait for a decision, newest first,
 * at most 50. Each row is the card's data, plus the origin and the name of the
 * agent (the token) that asked. A PAT never reaches this route: the app
 * session is the only credential that decides (C114).
 */
export async function handleApprovalList(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	if (ctx.url.searchParams.get('origin') !== 'mcp') {
		sendError(ctx.response, 400, 'invalid_origin');
		return 400;
	}
	const rows = await listPendingMcpApprovals(ctx.deps.db, user.userId, 50);
	const approvals = [];
	for (const row of rows) {
		const description = await describeApproval(ctx.deps.db, user, row);
		approvals.push({ ...description, origin: 'mcp' as const, agentName: String(row.agent_name) });
	}
	sendJson(ctx.response, 200, { approvals });
	return 200;
}

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
		items: body.items,
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

/** POST /api/ai/approvals/:id/resume */
export async function handleApprovalResume(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
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
	const sessionToken = bearerToken(ctx.request);
	if (!sessionToken) {
		sendError(ctx.response, 401, 'unauthorized');
		return 401;
	}
	// A resume writes the rest of a build_plan: a hook written since the approve
	// refuses it before the bucket or the row moves (C1127). The answer does not
	// depend on the row, so it says nothing about a foreign id.
	const refusal = await hookRefusal(ctx.deps.db, user.userId, ['build_plan']);
	if (refusal) {
		sendError(ctx.response, refusal.status, refusal.code);
		return refusal.status;
	}
	// A resume is a build pass too (C161): the day's bucket is spent before the
	// row moves, so an over-limit resume leaves the approval 'partial'.
	const daily = await checkDailyBuildLimit(ctx.deps.redis, user.userId, config.buildsPerDay);
	if (!daily.allowed) {
		sendError(ctx.response, 429, 'build_limit_reached');
		return 429;
	}
	const claimed = await claimPartial(ctx.deps.db, { id, ownerId: user.userId });
	if (!claimed) {
		const owned = await getOwnedApproval(ctx.deps.db, { id, ownerId: user.userId });
		if (!owned) {
			sendError(ctx.response, 404, 'not_found');
			return 404;
		}
		sendError(ctx.response, 409, 'approval_not_partial');
		return 409;
	}
	// revalidate
	const rv = revalidateStoredPlan(claimed.args);
	if (!rv.ok) {
		await recordOutcome(ctx.deps.db, { id: claimed.id, status: 'failed', error: rv.error });
		sendJson(ctx.response, 200, {
			ok: true,
			approvalId: claimed.id,
			status: 'failed',
			result: null,
			error: rv.error,
			continuationRunId: null,
		});
		return 200;
	}
	const plan = rv.plan;
	const execResult = await executePlan({
		db: ctx.deps.db,
		user,
		sessionToken,
		approval: claimed,
		plan,
		budgetMs: config.buildBudgetMs,
	});
	const c = execResult.counts;
	let status: 'partial' | 'failed' | 'executed';
	if (c.pending > 0) status = 'partial';
	else if (c.done === 0) status = 'failed';
	else status = 'executed';
	const result = { ...c, created: execResult.created, counts: c };
	await recordOutcome(ctx.deps.db, { id: claimed.id, status, result });
	sendJson(ctx.response, 200, {
		ok: true,
		approvalId: claimed.id,
		status,
		result,
		error: null,
		continuationRunId: null,
	});
	return 200;
}

/**
 * POST /api/ai/approvals/:id/undo
 *
 * "Remove what was built": the pages THIS plan built are archived through the
 * bridge's soft-archive path, deepest and latest first. A page that still
 * holds a live child the plan did not build is kept — the bridge cascades, and
 * that child is the user's own page. The databases are kept: an object
 * database has no soft-archive path.
 *
 * There is no body. The approval's status does not change; its result gains
 * the number of pages the undo archived.
 */
export async function handleApprovalUndo(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	// The undo is rate-limited like the decisions: it costs one bridge write per
	// page.
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
	const approval = await getOwnedApproval(ctx.deps.db, { id, ownerId: user.userId });
	if (!approval) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	if (approval.tool !== 'build_plan') {
		sendError(ctx.response, 409, 'not_a_plan');
		return 409;
	}
	if (approval.status !== 'executed' && approval.status !== 'partial') {
		sendError(ctx.response, 409, 'approval_not_built');
		return 409;
	}
	const sessionToken = bearerToken(ctx.request);
	if (!sessionToken) {
		sendError(ctx.response, 401, 'unauthorized');
		return 401;
	}
	// No page is done any more: the first undo already took them.
	const pages = await donePageItems(ctx.deps.db, approval.id);
	if (pages.length === 0) {
		sendError(ctx.response, 409, 'nothing_to_undo');
		return 409;
	}
	const undone = await undoBuild({
		db: ctx.deps.db,
		sessionToken,
		approval,
	});
	sendJson(ctx.response, 200, { ok: true, approvalId: approval.id, ...undone });
	return 200;
}

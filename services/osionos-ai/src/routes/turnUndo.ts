import { bearerToken } from '../auth.ts';
import { config } from '../config.ts';
import { sendError, sendJson } from '../http.ts';
import { checkRunRateLimit } from '../rateLimit.ts';
import { COLUMNS } from '../approvals/repo.ts';
import type { ApprovalRow } from '../approvals/types.ts';
import { UNDOABLE_TOOLS, undoApplied } from '../approvals/undoApplied.ts';
import type { UndoResult } from '../approvals/undoApplied.ts';
import { UUID, requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The undo routes of applied writes (AM8): one approval, or a whole turn.
 *
 * Neither stores the token: it travels from the request to the bridge call.
 */

const REFUSAL_STATUS = { changed_since: 409, already_undone: 409, not_undoable: 409, expired: 409, failed: 502 } as const;

function bridgeUrlOf(): string {
	return config.bridgeUrl ?? '';
}

/** POST /api/ai/approvals/:id/undo for an applied write: the answer of `undoApplied`. */
export async function answerAppliedUndo(ctx: RouteContext, approval: ApprovalRow, sessionToken: string): Promise<number> {
	const result = await undoApplied({ db: ctx.deps.db, bridgeUrl: bridgeUrlOf(), sessionToken, approval });
	if (result.ok) {
		sendJson(ctx.response, 200, { ok: true, approvalId: approval.id, tool: approval.tool });
		return 200;
	}
	sendError(ctx.response, REFUSAL_STATUS[result.code], result.code);
	return REFUSAL_STATUS[result.code];
}

/**
 * The undoable rows of a turn the caller owns, newest first, minus the ones already undone.
 * A turn spans its decided continuations, which share the turn_id of the run that asked;
 * the id named may be a run of the turn or the turn id itself.
 */
async function turnRows(ctx: RouteContext, turnId: string, ownerId: string): Promise<ApprovalRow[]> {
	const found = await ctx.deps.db.query<ApprovalRow>(
		`select ${COLUMNS} from public.ai_approvals
		  where run_id in (
		        select id from public.ai_runs
		         where owner_id = $2
		           and (id = $1 or turn_id = $1 or turn_id = (select turn_id from public.ai_runs where id = $1 and owner_id = $2)))
		    and owner_id = $2 and status = 'executed' and tool = any($3::text[])
		    and coalesce(result, '{}'::jsonb)->>'undoneAt' is null
		  order by created_at desc, id desc`,
		[turnId, ownerId, [...UNDOABLE_TOOLS]],
	);
	return found.rows;
}

interface RowReport {
	approvalId: string;
	tool: string;
	ok: boolean;
	code?: Exclude<UndoResult, { ok: true }>['code'];
}

/**
 * POST /api/ai/runs/:id/undo-writes
 *
 * Undoes the turn's applied writes newest first and stops at the first
 * refusal: an older write may rest on a newer one, so skipping past a
 * refusal could leave the page worse than either end. A stopped turn is a
 * 409 whose `results` say what was undone and which row refused; calling it
 * again resumes from there (the undone rows are not listed again).
 *
 * Caveat: the rows are read once, so a write applied while the undo runs is
 * not part of this turn's undo. The order is `created_at desc, id desc`: two
 * writes in the same millisecond, or the rows of one coalesced add_blocks
 * batch, undo in id order, which may not be the reverse of the order they were
 * applied in. A later row resting on an earlier one then refuses as
 * `changed_since` and the undo stops there; nothing is undone out of turn
 * past a refusal.
 */
export async function handleTurnUndo(ctx: RouteContext): Promise<number> {
	if (!config.modesEnabled) return fail(ctx, 404, 'not_found');
	const user = requireUser(ctx);
	if (!user) return 401;
	const runId = ctx.params[0] ?? '';
	const sessionToken = bearerToken(ctx.request);
	if (!sessionToken) return fail(ctx, 401, 'unauthorized');
	const rate = await checkRunRateLimit(ctx.deps.redis, user.userId, config.runsPerMinute);
	if (!rate.allowed) return fail(ctx, 429, 'rate_limited');
	const rows = UUID.test(runId) ? await turnRows(ctx, runId, user.userId) : [];
	if (rows.length === 0) return fail(ctx, 404, 'not_found');
	const results: RowReport[] = [];
	for (const approval of rows) {
		const result = await undoApplied({ db: ctx.deps.db, bridgeUrl: bridgeUrlOf(), sessionToken, approval });
		results.push({ approvalId: approval.id, tool: approval.tool, ok: result.ok, ...(result.ok ? {} : { code: result.code }) });
		if (!result.ok) break;
	}
	const stopped = results.some((report) => !report.ok);
	sendJson(ctx.response, stopped ? 409 : 200, { ok: !stopped, results });
	return stopped ? 409 : 200;
}

function fail(ctx: RouteContext, status: number, code: string): number {
	sendError(ctx.response, status, code);
	return status;
}

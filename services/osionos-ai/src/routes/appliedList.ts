import type { Pool } from 'pg';
import { config } from '../config.ts';
import { getOwnedConversation } from '../conversations/repo.ts';
import { sendError, sendJson } from '../http.ts';
import { COLUMNS } from '../approvals/repo.ts';
import { successSummary } from '../approvals/apply.ts';
import type { ApprovalRow, DecidedBy } from '../approvals/types.ts';
import { isUndoable, undoneAtOf, undoWindowEnd } from '../approvals/undoApplied.ts';
import { UUID, requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * GET /api/ai/conversations/:id/applied (AM19): the writes an auto mode applied
 * on its own in the caller's conversation, newest first, so the user can find
 * and undo them. Rows decided by the user are not listed; the list carries
 * what each item needs and never the arguments or the stored result.
 */
export interface AppliedItem {
	approvalId: string;
	runId: string;
	turnId: string;
	tool: string;
	target: string;
	summary: string;
	decidedBy: DecidedBy;
	decidedAt: string;
	undoneAt: string | null;
	undoable: boolean;
	undoUntil: string;
}

/** Caveat: past 200 auto writes the oldest are not listed; the list has no cursor. */
const LIST_LIMIT = 200;

type AppliedRow = ApprovalRow & { turn_id: string | null };

function refuse(ctx: RouteContext, status: number, code: string): number {
	sendError(ctx.response, status, code);
	return status;
}

/** The page the write touched or made, as the `write.applied` event names it. */
function targetOf(result: Record<string, unknown> | null): string {
	const created = result?.createdPageId;
	const page = result?.pageId;
	return typeof created === 'string' ? created : typeof page === 'string' ? page : '';
}

/** The words execution recorded; a rename or a create records none, so the event's own sentence is rebuilt. */
function summaryOf(row: ApprovalRow): string {
	const stored = (row.result as { summary?: unknown } | null)?.summary;
	return typeof stored === 'string' ? stored : successSummary(row);
}

function itemOf(row: AppliedRow): AppliedItem {
	const runId = row.run_id ?? '';
	return {
		approvalId: row.id,
		runId,
		turnId: row.turn_id ?? runId,
		tool: row.tool,
		target: targetOf(row.result as Record<string, unknown> | null),
		summary: summaryOf(row),
		decidedBy: row.decided_by as DecidedBy,
		decidedAt: new Date(row.decided_at ?? row.created_at).toISOString(),
		undoneAt: undoneAtOf(row),
		undoable: isUndoable(row),
		undoUntil: undoWindowEnd(row).toISOString(),
	};
}

async function appliedRows(db: Pool, conversationId: string, ownerId: string): Promise<AppliedRow[]> {
	const cols = COLUMNS.split(', ').map((c) => `a.${c}`).join(', ');
	const found = await db.query<AppliedRow>(
		`select ${cols}, r.turn_id::text as turn_id
		   from public.ai_approvals a left join public.ai_runs r on r.id = a.run_id
		  where a.conversation_id = $1 and a.owner_id = $2 and a.status = 'executed' and a.decided_by like 'auto:%'
		  order by a.decided_at desc, a.id desc
		  limit ${LIST_LIMIT}`,
		[conversationId, ownerId],
	);
	return found.rows;
}

export async function handleAppliedList(ctx: RouteContext): Promise<number> {
	// Flag first: off, even an anonymous caller must not learn the route exists.
	if (!config.modesEnabled) return refuse(ctx, 404, 'not_found');
	const user = requireUser(ctx);
	if (!user) return 401;
	const id = ctx.params[0] ?? '';
	const owned = UUID.test(id) ? await getOwnedConversation(ctx.deps.db, { id, ownerId: user.userId }) : null;
	if (!owned) return refuse(ctx, 404, 'not_found');
	sendJson(ctx.response, 200, { items: (await appliedRows(ctx.deps.db, id, user.userId)).map(itemOf) });
	return 200;
}

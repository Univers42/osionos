import type { Pool } from 'pg';
import type { ApprovalRow, ApprovalStatus } from './types.ts';

/**
 * The approvals, in the database.
 *
 * Four statements matter, and each of them is atomic on its own:
 *
 * - the INSERT, which the partial unique index refuses when the same call is
 *   already waiting (the duplicate of a run);
 * - the CLAIM, which moves a row out of 'pending' once, and only once, so two
 *   decisions that race execute ONE write;
 * - the OUTCOME, which is written before the continuation starts, so a run
 *   that goes on knows what the write did;
 * - the SWEEP, which reconciles the rows nobody finished.
 */

/** The columns of an approval, in the order the queries read them. */
const COLUMNS =
	'id, run_id, conversation_id, owner_id, workspace_id, tool, args, args_sha256, status, result, error, created_at, decided_at, expires_at';

/** How long a user has to decide: ten minutes. */
export const APPROVAL_TTL_MS = 10 * 60_000;

/** How long a write may stay 'executing' before the sweeper reconciles it. */
export const EXECUTING_TIMEOUT_MS = 5 * 60_000;

/** How long a decided approval is kept before it is deleted. */
export const APPROVAL_RETENTION_DAYS = 7;

/**
 * The new approval of a call.
 *
 * Null means the call is ALREADY waiting: the partial unique index
 * (run_id, tool, args_sha256) refuses the second one, and the tool tells the
 * model that its request is already on the table.
 */
export async function insertApproval(
	db: Pool,
	{
		runId,
		conversationId,
		ownerId,
		workspaceId,
		tool,
		args,
		argsSha256,
	}: {
		runId: string;
		conversationId: string;
		ownerId: string;
		workspaceId: string;
		tool: string;
		args: Record<string, unknown>;
		argsSha256: string;
	},
): Promise<ApprovalRow | null> {
	try {
		const result = await db.query<ApprovalRow>(
			`insert into public.ai_approvals
			   (run_id, conversation_id, owner_id, workspace_id, tool, args, args_sha256, status, expires_at)
			 values ($1, $2, $3, $4, $5, $6::jsonb, $7, 'pending', now() + ($8::int * interval '1 millisecond'))
			 returning ${COLUMNS}`,
			[
				runId,
				conversationId,
				ownerId,
				workspaceId,
				tool,
				JSON.stringify(args),
				argsSha256,
				APPROVAL_TTL_MS,
			],
		);
		return result.rows[0] ?? null;
	} catch (error) {
		// 23505: the unique index of the live calls. The id is the database's
		// own, so the conflict is the duplicate and nothing else.
		if ((error as { code?: unknown }).code === '23505') return null;
		throw error;
	}
}

/** One approval, but only when the caller owns it: a foreign one does not exist. */
export async function getOwnedApproval(
	db: Pool,
	{ id, ownerId }: { id: string; ownerId: string },
): Promise<ApprovalRow | null> {
	const result = await db.query<ApprovalRow>(
		`select ${COLUMNS} from public.ai_approvals where id = $1 and owner_id = $2 limit 1`,
		[id, ownerId],
	);
	return result.rows[0] ?? null;
}

/**
 * The claim of an approval: the ONE statement that decides who writes.
 *
 * The row moves out of 'pending' once, and only once: two decisions that race
 * find the row in one state or the other, never in both. The expiry is part of
 * the predicate: an approval nobody answered in time is not decided at all.
 *
 * This is the statement the revert proof breaks: drop the `status = 'pending'`
 * predicate and two racing decisions both write.
 */
export async function claimApproval(
	db: Pool,
	{
		id,
		ownerId,
		next,
	}: {
		id: string;
		ownerId: string;
		next: Extract<ApprovalStatus, 'executing' | 'declined'>;
	},
): Promise<ApprovalRow | null> {
	const result = await db.query<ApprovalRow>(
		`update public.ai_approvals
		    set status = $3, decided_at = now()
		  where id = $1 and owner_id = $2 and status = 'pending' and expires_at > now()
		  returning ${COLUMNS}`,
		[id, ownerId, next],
	);
	return result.rows[0] ?? null;
}

/**
 * The claim of a partial approval for resume: the ONE statement that moves a
 * 'partial' row back to 'executing'. Two racing resumes: one wins.
 */
export async function claimPartial(
	db: Pool,
	{ id, ownerId }: { id: string; ownerId: string },
): Promise<ApprovalRow | null> {
	const result = await db.query<ApprovalRow>(
		`update public.ai_approvals
		    set status = 'executing', decided_at = now()
		  where id = $1 and owner_id = $2 and status = 'partial'
		  returning ${COLUMNS}`,
		[id, ownerId],
	);
	return result.rows[0] ?? null;
}

/** The outcome of a write: the row leaves 'executing' with what happened. */
export async function recordOutcome(
	db: Pool,
	{
		id,
		status,
		result,
		error,
	}: {
		id: string;
		status: Extract<ApprovalStatus, 'executed' | 'failed' | 'partial'>;
		result?: unknown;
		error?: string | null;
	},
): Promise<boolean> {
	const updated = await db.query(
		`update public.ai_approvals
		    set status = $2, result = coalesce($3::jsonb, result), error = $4, decided_at = now()
		  where id = $1 and status = 'executing'`,
		[id, status, result === undefined ? null : JSON.stringify(result), error ?? null],
	);
	return updated.rowCount === 1;
}

/** The number of the writes of a run that are already approved and executed. */
export async function countExecutedInRun(db: Pool, runId: string): Promise<number> {
	const result = await db.query<{ count: string }>(
		`select count(*)::text as count from public.ai_approvals where run_id = $1 and status = 'executed'`,
		[runId],
	);
	return Number(result.rows[0]?.count ?? 0);
}

/** The number of the plans of a user that are still waiting for a decision (C161). */
export async function countPendingPlans(db: Pool, ownerId: string): Promise<number> {
	const result = await db.query<{ count: string }>(
		`select count(*)::text as count
		   from public.ai_approvals
		  where owner_id = $1 and tool = 'build_plan' and status = 'pending' and expires_at > now()`,
		[ownerId],
	);
	return Number(result.rows[0]?.count ?? 0);
}

/** What the sweeper did. */
export interface SweepOutcome {
	/** The approvals nobody answered in time. */
	expired: number;
	/** The writes whose outcome was never recorded: they MAY have happened. */
	unknown: number;
	/** The rows that were old enough to go. */
	deleted: number;
}

/**
 * The sweep of the approvals.
 *
 * Three moves, in this order:
 *
 * - a PENDING row whose time is up becomes 'expired': the question closed
 *   itself;
 * - an EXECUTING row whose claim is older than the write timeout becomes
 *   'unknown': the process died between the write and the outcome, so the write
 *   MAY have happened. It is never retried: a second write would be a second
 *   page;
 * - a DECIDED row older than the retention is deleted: the table does not grow
 *   for ever.
 *
 * The clock is a parameter, so the tests may move it.
 */
export async function sweepApprovals(
	db: Pool,
	{
		now = new Date(),
		executingTimeoutMs = EXECUTING_TIMEOUT_MS,
		retentionDays = APPROVAL_RETENTION_DAYS,
	}: { now?: Date; executingTimeoutMs?: number; retentionDays?: number } = {},
): Promise<SweepOutcome> {
	const expiredAt = new Date(now.getTime());
	const executingCutoff = new Date(now.getTime() - executingTimeoutMs);
	const retentionCutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60_000);

	const expired = await db.query(
		`update public.ai_approvals
		    set status = 'expired', decided_at = now()
		  where status = 'pending' and expires_at <= $1`,
		[expiredAt],
	);
	const unknown = await db.query(
		`update public.ai_approvals
		    set status = 'unknown', error = $2, decided_at = coalesce(decided_at, now())
		  where status = 'executing' and decided_at < $1`,
		[executingCutoff, 'may have executed — check the page'],
	);
	const deleted = await db.query(
		`delete from public.ai_approvals
		  where status not in ('pending','executing')
		    and coalesce(decided_at, created_at) < $1`,
		[retentionCutoff],
	);
	return {
		expired: expired.rowCount ?? 0,
		unknown: unknown.rowCount ?? 0,
		deleted: deleted.rowCount ?? 0,
	};
}

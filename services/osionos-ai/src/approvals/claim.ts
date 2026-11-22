import type { Pool } from 'pg';
import { COLUMNS } from './repo.ts';
import type { ApprovalRow, ApprovalStatus, DecidedBy } from './types.ts';

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
		decidedBy,
	}: {
		id: string;
		ownerId: string;
		next: Extract<ApprovalStatus, 'executing' | 'declined'>;
		decidedBy: DecidedBy;
	},
): Promise<ApprovalRow | null> {
	const result = await db.query<ApprovalRow>(
		`update public.ai_approvals
		    set status = $3, decided_at = now(), decided_by = $4
		  where id = $1 and owner_id = $2 and status = 'pending' and expires_at > now()
		  returning ${COLUMNS}`,
		[id, ownerId, next, decidedBy],
	);
	return result.rows[0] ?? null;
}

/**
 * Gives an AUTO claim back: executing -> pending, with no decider.
 *
 * Only an auto claim: a human's decision is never taken back by the service.
 * Caveat: it must run before any write went out; once the bridge was called the
 * row is the record of a write and stays executing until its outcome lands.
 */
export async function unclaimAuto(db: Pool, id: string): Promise<boolean> {
	const result = await db.query(
		`update public.ai_approvals
		    set status = 'pending', decided_by = null, decided_at = null
		  where id = $1 and status = 'executing' and decided_by like 'auto:%'`,
		[id],
	);
	return result.rowCount === 1;
}

import type { Pool } from 'pg';

/**
 * The claim of an undo: `result.undoneAt` is set once, and only once, by one
 * statement, so two racing undos write the inverse ONE time. The status stays
 * 'executed': the write did happen, and the row keeps saying so.
 */
export async function claimUndo(db: Pool, id: string, ownerId: string): Promise<boolean> {
	const claimed = await db.query(
		`update public.ai_approvals
		    set result = jsonb_set(coalesce(result, '{}'::jsonb), '{undoneAt}', to_jsonb(now()::text))
		  where id = $1 and owner_id = $2 and status = 'executed'
		    and coalesce(result, '{}'::jsonb)->>'undoneAt' is null`,
		[id, ownerId],
	);
	return claimed.rowCount === 1;
}

/** Gives the claim back after an undo write that did not land, so a retry can go. */
export async function releaseUndo(db: Pool, id: string): Promise<void> {
	await db.query(`update public.ai_approvals set result = result - 'undoneAt' where id = $1 and status = 'executed'`, [id]);
}

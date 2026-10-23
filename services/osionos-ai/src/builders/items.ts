import type { Pool, QueryResultRow } from 'pg';

/**
 * The state of the items of a builder plan, in `ai_plan_items`.
 *
 * Pure SQL helpers, one statement each, pg parameters only (devil C155).
 */

export interface PlanItemRow extends QueryResultRow {
	approval_id: string;
	item_key: string;
	kind: string;
	parent_key: string | null;
	position: number;
	status: string;
	created_id: string | null;
	error: string | null;
	updated_at: Date;
}

/** The columns, in the order the queries read them. */
const COLUMNS =
	'approval_id, item_key, kind, parent_key, position, status, created_id, error, updated_at';

/**
 * Seed every flat item once. `position` is the index in the flattenPlan order.
 * A row that already exists (a resume) is left untouched.
 */
export async function seedItems(
	db: Pool,
	approvalId: string,
	rows: readonly { key: string; kind: string; parentKey: string | null }[],
): Promise<void> {
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]!;
		await db.query(
			`insert into public.ai_plan_items
			   (approval_id, item_key, kind, parent_key, position, status)
			 values ($1, $2, $3, $4, $5, 'pending')
			 on conflict (approval_id, item_key) do nothing`,
			[approvalId, row.key, row.kind, row.parentKey, i],
		);
	}
}

/** The rows still pending, in position order. */
export async function pendingItems(db: Pool, approvalId: string): Promise<PlanItemRow[]> {
	const result = await db.query<PlanItemRow>(
		`select ${COLUMNS} from public.ai_plan_items where approval_id = $1 and status = 'pending' order by position`,
		[approvalId],
	);
	return result.rows;
}

/** Every row, in position order. */
export async function allItems(db: Pool, approvalId: string): Promise<PlanItemRow[]> {
	const result = await db.query<PlanItemRow>(
		`select ${COLUMNS} from public.ai_plan_items where approval_id = $1 order by position`,
		[approvalId],
	);
	return result.rows;
}

/** Set the state of one item, and stamp updated_at. */
export async function setItem(
	db: Pool,
	approvalId: string,
	key: string,
	status: string,
	createdId?: string | null,
	error?: string | null,
): Promise<boolean> {
	const updated = await db.query(
		`update public.ai_plan_items
		    set status = $3, created_id = $4, error = $5, updated_at = now()
		  where approval_id = $1 and item_key = $2`,
		[approvalId, key, status, createdId ?? null, error ?? null],
	);
	return updated.rowCount === 1;
}

/** The built page items, deepest and latest first: the reverse of the plan order (C159). */
export async function donePageItems(db: Pool, approvalId: string): Promise<PlanItemRow[]> {
	const result = await db.query<PlanItemRow>(
		`select ${COLUMNS} from public.ai_plan_items
		  where approval_id = $1 and kind = 'page' and status = 'done'
		  order by position desc`,
		[approvalId],
	);
	return result.rows;
}

/** The built database items: they are kept, never archived (C159). */
export async function countDoneDatabases(db: Pool, approvalId: string): Promise<number> {
	const result = await db.query<{ count: string }>(
		`select count(*)::text as count from public.ai_plan_items
		  where approval_id = $1 and kind = 'database' and status = 'done'`,
		[approvalId],
	);
	return Number(result.rows[0]?.count ?? 0);
}

/**
 * The claim of one item for an undo (C159): only a row that is still 'done'
 * moves, so two undos that race archive a page ONCE.
 */
export async function claimItemForUndo(
	db: Pool,
	approvalId: string,
	key: string,
): Promise<{ claimed: boolean; createdId: string | null }> {
	const result = await db.query<{ created_id: string | null }>(
		`update public.ai_plan_items
		    set status = 'undone', updated_at = now()
		  where approval_id = $1 and item_key = $2 and status = 'done'
		  returning created_id`,
		[approvalId, key],
	);
	return { claimed: result.rowCount === 1, createdId: result.rows[0]?.created_id ?? null };
}

/** Put a claimed item back to 'done' with the reason it was kept or failed. */
export async function releaseItem(
	db: Pool,
	approvalId: string,
	key: string,
	createdId: string | null,
	error: string,
): Promise<void> {
	await setItem(db, approvalId, key, 'done', createdId, error);
}

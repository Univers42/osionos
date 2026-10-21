import type { Pool, QueryResultRow } from 'pg';
import { settle } from '../budget.ts';

export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface RunRow extends QueryResultRow {
	id: string;
	conversation_id: string;
	owner_id: string;
	status: RunStatus;
	model: string;
	error: string | null;
	usage: unknown;
	reserved_microusd: string | number;
	created_at: Date;
	ended_at: Date | null;
}

const RUN_COLUMNS =
	'id, conversation_id, owner_id, status, model, error, usage, reserved_microusd, created_at, ended_at';

/** One run, whatever its owner. */
export async function getRun(db: Pool, id: string): Promise<RunRow | null> {
	const result = await db.query<RunRow>(
		`select ${RUN_COLUMNS} from public.ai_runs where id = $1 limit 1`,
		[id],
	);
	return result.rows[0] ?? null;
}

/** One run, but only when the caller owns it: a foreign run is a 404. */
export async function getOwnedRun(
	db: Pool,
	{ id, ownerId }: { id: string; ownerId: string },
): Promise<RunRow | null> {
	const result = await db.query<RunRow>(
		`select ${RUN_COLUMNS} from public.ai_runs where id = $1 and owner_id = $2 limit 1`,
		[id, ownerId],
	);
	return result.rows[0] ?? null;
}

/**
 * The row of the run. The id is the client's, so a repeated id finds the row
 * that is already there instead of starting a second run.
 */
export async function insertRun(
	db: Pool,
	{ runId, conversationId, ownerId, model }: { runId: string; conversationId: string; ownerId: string; model: string },
): Promise<{ kind: 'inserted' | 'exists' | 'conflict' | 'missing' }> {
	try {
		const result = await db.query(
			`insert into public.ai_runs (id, conversation_id, owner_id, status, model)
			 values ($1, $2, $3, 'running', $4)
			 on conflict (id) do nothing
			 returning id`,
			[runId, conversationId, ownerId, model],
		);
		return result.rowCount === 1 ? { kind: 'inserted' } : { kind: 'exists' };
	} catch (error) {
		const code = (error as { code?: unknown }).code;
		if (code === '23505') return { kind: 'conflict' };
		if (code === '23503') return { kind: 'missing' };
		throw error;
	}
}

/**
 * The end of a run. The row moves out of 'running' only once: the second
 * attempt finds nothing to update and does not settle the budget twice.
 */
export async function markRun(
	db: Pool,
	runId: string,
	status: RunStatus,
	error?: string | null,
	usage?: unknown,
): Promise<boolean> {
	const result = await db.query(
		`update public.ai_runs
		 set status = $2, error = $3, ended_at = now(), usage = coalesce($4::jsonb, usage)
		 where id = $1 and status = 'running'
		 returning id`,
		[runId, status, error ?? null, usage === undefined ? null : JSON.stringify(usage)],
	);
	return result.rowCount === 1;
}

/**
 * The sweep of the stale runs: a run that says 'running' for ten minutes is
 * not running any more. It is failed, and the reservation it holds is given
 * back.
 */
export async function sweepStaleRows(
	db: Pool,
	staleMs: number,
	today: string,
): Promise<string[]> {
	const stale = await db.query(
		`select id, owner_id, reserved_microusd
		 from public.ai_runs
		 where status = 'running' and created_at < now() - ($1::int * interval '1 millisecond')`,
		[staleMs],
	);
	const swept: string[] = [];
	for (const row of stale.rows) {
		const changed = await markRun(db, row.id as string, 'failed', 'timeout');
		if (!changed) continue;
		const reserved = Number(row.reserved_microusd ?? 0);
		if (reserved > 0) {
			await settle(db, { userId: row.owner_id as string, day: today, reserved, actual: 0 });
		}
		swept.push(row.id as string);
	}
	return swept;
}

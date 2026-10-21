import type { Pool, QueryResultRow } from 'pg';

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

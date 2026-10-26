import type { Pool, QueryResultRow } from 'pg';
import { settle } from '../budget.ts';

export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';
/** What a run makes: a chat turn, or a generated image (which has no conversation). */
export type RunKind = 'text' | 'image';

export interface RunRow extends QueryResultRow {
	id: string;
	conversation_id: string | null;
	owner_id: string;
	kind: RunKind;
	status: RunStatus;
	model: string;
	error: string | null;
	usage: unknown;
	reserved_microusd: string | number;
	created_at: Date;
	ended_at: Date | null;
	/** Why the run ended the way it did: 'awaiting_approval' when it asked. */
	finish_reason: string | null;
	/** The agent that shaped the run, and its version — pinned (devil C40). */
	agent_id: string | null;
	agent_version: number | null;
	/** A custom agent pins its own columns (C301); the built-in pair stays NULL for it. */
	custom_agent_id: string | null;
	custom_agent_version: number | null;
}

const RUN_COLUMNS =
	'id, conversation_id, owner_id, kind, status, model, error, usage, reserved_microusd, created_at, ended_at, finish_reason, agent_id, agent_version, custom_agent_id, custom_agent_version';

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
 *
 * The agent of the run is pinned on the row: its id AND its version, so the
 * answer can be explained later with the exact instructions it ran under
 * (devil C40). A run without an agent has NULL for both.
 */
export async function insertRun(
	db: Pool,
	{
		runId,
		conversationId,
		ownerId,
		model,
		kind = 'text',
		agentId = null,
		agentVersion = null,
		customAgentId = null,
		customAgentVersion = null,
		surface,
	}: {
		runId: string;
		conversationId: string | null;
		ownerId: string;
		model: string;
		kind?: RunKind;
		/** The agent that shaped the run, and its version. */
		agentId?: string | null;
		agentVersion?: number | null;
		customAgentId?: string | null;
		customAgentVersion?: number | null;
		/**
		 * The channel message a thread run answers (C430): written with the row,
		 * and only by the thread path. Absent, the two columns are not named,
		 * so a database without them takes every other run as before.
		 */
		surface?: { channelId: string; messageId: string };
	},
): Promise<{ kind: 'inserted' | 'exists' | 'conflict' | 'missing' }> {
	try {
		const result = await db.query(
			surface
				? `insert into public.ai_runs (id, conversation_id, owner_id, status, model, kind, agent_id, agent_version, custom_agent_id, custom_agent_version, surface, surface_ref)
				   values ($1, $2, $3, 'running', $4, $5, $6, $7, $8, $9, 'channel', $10::jsonb)
				   on conflict (id) do nothing
				   returning id`
				: `insert into public.ai_runs (id, conversation_id, owner_id, status, model, kind, agent_id, agent_version, custom_agent_id, custom_agent_version)
				   values ($1, $2, $3, 'running', $4, $5, $6, $7, $8, $9)
				   on conflict (id) do nothing
				   returning id`,
			[
				runId, conversationId, ownerId, model, kind, agentId, agentVersion, customAgentId, customAgentVersion,
				...(surface ? [JSON.stringify({ channelId: surface.channelId, messageId: surface.messageId })] : []),
			],
		);
		return result.rowCount === 1 ? { kind: 'inserted' } : { kind: 'exists' };
	} catch (error) {
		const code = (error as { code?: unknown }).code;
		if (code === '23505') return { kind: 'conflict' };
		if (code === '23503') return { kind: 'missing' };
		throw error;
	}
}

/** The one assistant message of a thread run, the text the bridge may post (C432). */
export async function setRunAnswer(db: Pool, runId: string, messageId: string): Promise<void> {
	await db.query('update public.ai_runs set answer_message_id = $2::uuid where id = $1', [runId, messageId]);
}

/**
 * The end of a run. The row moves out of 'running' only once: the second
 * attempt finds nothing to update and does not settle the budget twice.
 *
 * The finish reason says WHY the run ended: 'awaiting_approval' for a run
 * that asked the user for the right to write. It is written once, here, and
 * never by the sweeper.
 */
export async function markRun(
	db: Pool,
	runId: string,
	status: RunStatus,
	error?: string | null,
	usage?: unknown,
	finishReason?: string | null,
): Promise<boolean> {
	const result = await db.query(
		`update public.ai_runs
		 set status = $2, error = $3, ended_at = now(), usage = coalesce($4::jsonb, usage),
		     finish_reason = coalesce($5::text, finish_reason)
		 where id = $1 and status = 'running'
		 returning id`,
		[
			runId,
			status,
			error ?? null,
			usage === undefined ? null : JSON.stringify(usage),
			finishReason ?? null,
		],
	);
	return result.rowCount === 1;
}

/**
 * The sweep of the stale runs: a run that says 'running' for ten minutes is
 * not running any more. It is failed, and the reservation it holds is given
 * back — except the price of an image: its engine most likely ran, and an
 * image never settles at 0 (devil C74).
 */
export async function sweepStaleRows(
	db: Pool,
	staleMs: number,
	today: string,
): Promise<string[]> {
	const stale = await db.query(
		`select id, owner_id, kind, reserved_microusd
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
			const actual = row.kind === 'image' ? reserved : 0;
			await settle(db, { userId: row.owner_id as string, day: today, reserved, actual });
		}
		swept.push(row.id as string);
	}
	return swept;
}

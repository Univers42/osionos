import type { Pool, PoolClient } from 'pg';
import { inTransaction } from '../db.ts';

/**
 * The user memories in the database (models/osionos-ai-memory-migration.sql).
 *
 * A memory belongs to ONE user in ONE workspace and shapes only that user's
 * runs there (devil C41): every write below is `where id = $1 and user_id = $2`,
 * and a memory of someone else is "missing", never "forbidden". Every write is
 * ONE transaction with its audit row (C40). The caps are checked in the same
 * transaction under an advisory lock per (user, workspace), so two writes
 * cannot both pass them (C47).
 */

/** Proposals waiting for the user, per (user, workspace). */
export const MAX_PROPOSED = 20;
/** Approved memories, per (user, workspace). */
export const MAX_APPROVED = 50;
/** The approved memories one run puts in its prompt. */
export const MAX_IN_PROMPT = 20;
/** The longest memory, in characters: the CHECK of the table. */
export const MAX_BODY = 300;

export type MemoryStatus = 'proposed' | 'approved' | 'rejected' | 'archived';
type Action = 'propose' | 'approve' | 'reject' | 'edit' | 'archive';

export interface Memory {
	id: string;
	user_id: string;
	workspace_id: string;
	body: string;
	status: MemoryStatus;
	version: number;
	proposed_run_id: string | null;
	created_at: Date;
	updated_at: Date;
}

/** A memory as a run uses it. */
export interface RunMemory {
	id: string;
	version: number;
	body: string;
}

const COLUMNS = 'id, user_id, workspace_id, body, status, version, proposed_run_id, created_at, updated_at';

const AUDIT_SQL = `
	insert into public.ai_memory_audit (memory_id, actor_id, action, before, after)
	values ($1, $2, $3, $4::jsonb, $5::jsonb)`;

type Tx = PoolClient;

async function audit(client: Tx, action: Action, actorId: string, before: Memory | null, after: Memory): Promise<void> {
	await client.query(AUDIT_SQL, [after.id, actorId, action, before ? JSON.stringify(before) : null, JSON.stringify(after)]);
}

/** Serialises the writes of one (user, workspace): the caps cannot be raced. */
async function lockOwner(client: Tx, userId: string, workspaceId: string): Promise<void> {
	await client.query('select pg_advisory_xact_lock(hashtextextended($1::text, 0))', [`ai_memories:${userId}:${workspaceId}`]);
}

async function countStatus(client: Tx, userId: string, workspaceId: string, status: MemoryStatus): Promise<number> {
	const result = await client.query<{ n: number }>(
		'select count(*)::int as n from public.ai_memories where user_id = $1 and workspace_id = $2 and status = $3',
		[userId, workspaceId, status],
	);
	return result.rows[0]?.n ?? 0;
}

export type ProposeOutcome =
	| { ok: true; memory: Memory }
	| { ok: false; reason: 'empty' | 'too_long' | 'too_many_pending' };

/** A new memory in `proposed`: inert until its owner approves it. */
export async function propose(
	db: Pool,
	input: { userId: string; workspaceId: string; body: string; runId: string | null },
): Promise<ProposeOutcome> {
	const body = input.body.trim();
	if (body.length === 0) return { ok: false, reason: 'empty' };
	if (body.length > MAX_BODY) return { ok: false, reason: 'too_long' };
	return inTransaction(db, async (client) => {
		await lockOwner(client, input.userId, input.workspaceId);
		if ((await countStatus(client, input.userId, input.workspaceId, 'proposed')) >= MAX_PROPOSED) {
			return { ok: false, reason: 'too_many_pending' } as const;
		}
		const inserted = await client.query<Memory>(
			`insert into public.ai_memories (user_id, workspace_id, body, status, proposed_run_id)
			 values ($1, $2, $3, 'proposed', $4) returning ${COLUMNS}`,
			[input.userId, input.workspaceId, body, input.runId],
		);
		const memory = inserted.rows[0] as Memory;
		await audit(client, 'propose', input.userId, null, memory);
		return { ok: true, memory } as const;
	});
}

export type ChangeOutcome =
	| { ok: true; memory: Memory }
	| { ok: false; reason: 'not_found' | 'wrong_state' | 'too_many_approved' | 'empty' | 'too_long' };

/** The memory of this owner, locked, or null: someone else's is the same as none. */
async function lockOwn(client: Tx, userId: string, memoryId: string): Promise<Memory | null> {
	const result = await client.query<Memory>(
		`select ${COLUMNS} from public.ai_memories where id = $1 and user_id = $2 for update`,
		[memoryId, userId],
	);
	return result.rows[0] ?? null;
}

/** Moves an owned memory to `to`, from one of the `from` states, with its audit row. */
async function transition(
	db: Pool,
	input: { userId: string; memoryId: string },
	action: Action,
	from: readonly MemoryStatus[],
	to: MemoryStatus,
): Promise<ChangeOutcome> {
	return inTransaction(db, async (client) => {
		const found = await lockOwn(client, input.userId, input.memoryId);
		if (!found) return { ok: false, reason: 'not_found' } as const;
		if (!from.includes(found.status)) return { ok: false, reason: 'wrong_state' } as const;
		if (to === 'approved') {
			await lockOwner(client, found.user_id, found.workspace_id);
			if ((await countStatus(client, found.user_id, found.workspace_id, 'approved')) >= MAX_APPROVED) {
				return { ok: false, reason: 'too_many_approved' } as const;
			}
		}
		const updated = await client.query<Memory>(
			`update public.ai_memories set status = $2, version = version + 1, updated_at = now()
			 where id = $1 and user_id = $3 returning ${COLUMNS}`,
			[found.id, to, input.userId],
		);
		const memory = updated.rows[0] as Memory;
		await audit(client, action, input.userId, found, memory);
		return { ok: true, memory } as const;
	});
}

export const approve = (db: Pool, input: { userId: string; memoryId: string }): Promise<ChangeOutcome> =>
	transition(db, input, 'approve', ['proposed'], 'approved');

export const reject = (db: Pool, input: { userId: string; memoryId: string }): Promise<ChangeOutcome> =>
	transition(db, input, 'reject', ['proposed'], 'rejected');

export const archive = (db: Pool, input: { userId: string; memoryId: string }): Promise<ChangeOutcome> =>
	transition(db, input, 'archive', ['proposed', 'approved'], 'archived');

/** New text for a `proposed` or `approved` memory; the status stays, the version goes up. */
export async function edit(db: Pool, input: { userId: string; memoryId: string; body: string }): Promise<ChangeOutcome> {
	const body = input.body.trim();
	if (body.length === 0) return { ok: false, reason: 'empty' };
	if (body.length > MAX_BODY) return { ok: false, reason: 'too_long' };
	return inTransaction(db, async (client) => {
		const found = await lockOwn(client, input.userId, input.memoryId);
		if (!found) return { ok: false, reason: 'not_found' } as const;
		if (found.status !== 'proposed' && found.status !== 'approved') return { ok: false, reason: 'wrong_state' } as const;
		const updated = await client.query<Memory>(
			`update public.ai_memories set body = $2, version = version + 1, updated_at = now()
			 where id = $1 and user_id = $3 returning ${COLUMNS}`,
			[found.id, body, input.userId],
		);
		const memory = updated.rows[0] as Memory;
		await audit(client, 'edit', input.userId, found, memory);
		return { ok: true, memory } as const;
	});
}

/** The caller's own proposed and approved memories in a workspace, newest first. */
export async function list(db: Pool, input: { userId: string; workspaceId: string }): Promise<Memory[]> {
	const result = await db.query<Memory>(
		`select ${COLUMNS} from public.ai_memories
		 where user_id = $1 and workspace_id = $2 and status in ('proposed', 'approved')
		 order by created_at desc, id limit ${MAX_PROPOSED + MAX_APPROVED}`,
		[input.userId, input.workspaceId],
	);
	return result.rows;
}

/** What a run may put in its prompt: approved only, the newest edits first, at most MAX_IN_PROMPT. */
export async function approvedForRun(db: Pool, input: { userId: string; workspaceId: string }): Promise<RunMemory[]> {
	const result = await db.query<RunMemory>(
		`select id, version, body from public.ai_memories
		 where user_id = $1 and workspace_id = $2 and status = 'approved'
		 order by updated_at desc, id limit ${MAX_IN_PROMPT}`,
		[input.userId, input.workspaceId],
	);
	return result.rows;
}

/** Pins the memories a run used on its row (devil C40): the prompt itself is not stored. */
export async function recordMemoryPins(db: Pool, runId: string, memories: readonly RunMemory[]): Promise<void> {
	if (memories.length === 0) return;
	const pins = memories.map(({ id, version }) => ({ id, version }));
	await db.query('update public.ai_runs set memory_pins = $2::jsonb where id = $1', [runId, JSON.stringify(pins)]);
}

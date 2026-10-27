import type { Pool, PoolClient, QueryResultRow } from 'pg';

/**
 * The summary of a conversation: the turns its history window dropped, as one
 * text on the conversation row (context C376).
 *
 * Every comparison of times runs in SQL: a JS Date drops the microseconds of a
 * timestamptz, and two messages of one transaction share theirs.
 */

/** The summary a run quotes, and whether the run should bring it up to date. */
export interface RunSummary {
	/** The summary and the time of the newest message it covers, when the run may quote it. */
	quoted: { text: string; through: Date } | null;
	/** Whether the window dropped messages the summary does not cover yet (C378). */
	behind: boolean;
}

interface RunSummaryRow extends QueryResultRow {
	summary: string | null;
	summary_through: Date | null;
	usable: boolean;
	behind: boolean;
}

/**
 * The summary of a run's conversation, read against the window of the run.
 *
 * The run quotes it only when it ends before the oldest message the window
 * kept: no turn is in the prompt twice (C384). A gap between the two is
 * allowed; `behind` is what closes it, after the run.
 */
export async function readRunSummary(
	db: Pool,
	{ conversationId, ownerId, oldestKeptId, dropped }: { conversationId: string; ownerId: string; oldestKeptId: string | null; dropped: boolean },
): Promise<RunSummary> {
	const result = await db.query<RunSummaryRow>(
		`select c.summary, c.summary_through,
		        (c.summary is not null and c.summary_through is not null
		          and ($3::uuid is null or c.summary_through < k.created_at)) as usable,
		        ($3::uuid is not null and exists (
		          select 1 from public.ai_messages m
		          where m.conversation_id = c.id
		            and (c.summary_through is null or m.created_at > c.summary_through)
		            and (m.created_at, m.id) < (k.created_at, k.id))) as behind
		 from public.ai_conversations c
		 left join public.ai_messages k on k.id = $3::uuid and k.conversation_id = c.id
		 where c.id = $1 and c.owner_id = $2`,
		[conversationId, ownerId, oldestKeptId],
	);
	const row = result.rows[0];
	if (!row) return { quoted: null, behind: false };
	return {
		quoted: row.usable && row.summary !== null && row.summary_through !== null ? { text: row.summary, through: row.summary_through } : null,
		behind: dropped && row.behind,
	};
}

/** One dropped message the summary does not cover yet. */
export interface DroppedMessage {
	id: string;
	role: string;
	parts: unknown;
}

/** What a summary is written from: the summary so far, its version, and the turns after it. */
export interface SummaryInput {
	previous: string | null;
	version: number;
	messages: DroppedMessage[];
}

interface SummaryInputRow extends QueryResultRow {
	summary: string | null;
	summary_version: number;
	id: string | null;
	role: string | null;
	parts: unknown;
}

/**
 * The dropped turns after the summary, oldest first, read in ONE statement
 * with the summary and its version: the write that follows compares that
 * version (C382). Null when the conversation, or the oldest message the run
 * kept, is gone (an edit deleted it).
 */
export async function readSummaryInput(
	db: Pool,
	{ conversationId, ownerId, oldestKeptId }: { conversationId: string; ownerId: string; oldestKeptId: string },
): Promise<SummaryInput | null> {
	const result = await db.query<SummaryInputRow>(
		`select c.summary, c.summary_version, m.id, m.role, m.parts
		 from public.ai_conversations c
		 join public.ai_messages k on k.id = $3::uuid and k.conversation_id = c.id
		 left join public.ai_messages m on m.conversation_id = c.id
		   and (c.summary_through is null or m.created_at > c.summary_through)
		   and (m.created_at, m.id) < (k.created_at, k.id)
		 where c.id = $1 and c.owner_id = $2 and c.archived_at is null
		 order by m.created_at asc, m.id asc`,
		[conversationId, ownerId, oldestKeptId],
	);
	const first = result.rows[0];
	if (!first) return null;
	const messages: DroppedMessage[] = [];
	for (const row of result.rows) {
		if (row.id !== null && row.role !== null) messages.push({ id: row.id, role: row.role, parts: row.parts });
	}
	return { previous: first.summary, version: Number(first.summary_version), messages };
}

/**
 * Writes the summary, only over the version it was written from (C382): a
 * lost race writes nothing. `throughMessageId` is the newest message it
 * covers; the write is refused when that message is gone, since an edit
 * deletes every message from its cut onward, so a summary of deleted turns is
 * never written (C383).
 */
export async function writeSummary(
	db: Pool,
	input: { conversationId: string; ownerId: string; readVersion: number; summary: string; throughMessageId: string },
): Promise<boolean> {
	const result = await db.query(
		`update public.ai_conversations c
		 set summary = $4, summary_through = t.created_at, summary_version = c.summary_version + 1
		 from public.ai_messages t
		 where c.id = $1 and c.owner_id = $2 and c.summary_version = $3
		   and t.id = $5::uuid and t.conversation_id = c.id`,
		[input.conversationId, input.ownerId, input.readVersion, input.summary, input.throughMessageId],
	);
	return (result.rowCount ?? 0) === 1;
}

/** Clears the summary of a conversation the caller owns (C391). False when there is no such conversation. */
export async function clearSummary(
	db: Pool | PoolClient,
	{ conversationId, ownerId }: { conversationId: string; ownerId: string },
): Promise<boolean> {
	const result = await db.query(
		`update public.ai_conversations
		 set summary = null, summary_through = null, summary_version = summary_version + 1
		 where id = $1 and owner_id = $2 and archived_at is null`,
		[conversationId, ownerId],
	);
	return (result.rowCount ?? 0) === 1;
}

/** The summary of a conversation the caller owns, as the transcript shows it. */
export async function readOwnedSummary(
	db: Pool,
	{ conversationId, ownerId }: { conversationId: string; ownerId: string },
): Promise<{ text: string; through: string } | null> {
	const result = await db.query<{ summary: string | null; summary_through: Date | null }>(
		'select summary, summary_through from public.ai_conversations where id = $1 and owner_id = $2',
		[conversationId, ownerId],
	);
	const row = result.rows[0];
	if (!row || row.summary === null || row.summary_through === null) return null;
	return { text: row.summary, through: row.summary_through.toISOString() };
}

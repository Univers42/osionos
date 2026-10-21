import type { Pool, PoolClient, QueryResultRow } from 'pg';

export interface ConversationRow extends QueryResultRow {
	id: string;
	owner_id: string;
	workspace_id: string;
	title: string;
	model: string | null;
	created_at: Date;
	updated_at: Date;
	archived_at: Date | null;
}

export interface MessageRow extends QueryResultRow {
	id: string;
	conversation_id: string;
	run_id: string | null;
	role: string;
	parts: unknown[];
	model: string | null;
	usage: unknown;
	created_at: Date;
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

const CONVERSATION_COLUMNS = 'id, owner_id, workspace_id, title, model, created_at, updated_at, archived_at';
const MESSAGE_COLUMNS = 'id, conversation_id, run_id, role, parts, model, usage, created_at';

/** A conversation, owned by its creator. */
export async function createConversation(
	db: Pool,
	{ ownerId, workspaceId, title }: { ownerId: string; workspaceId: string; title: string },
): Promise<ConversationRow> {
	const result = await db.query<ConversationRow>(
		`insert into public.ai_conversations (owner_id, workspace_id, title)
		 values ($1, $2, $3)
		 returning ${CONVERSATION_COLUMNS}`,
		[ownerId, workspaceId, title],
	);
	return result.rows[0];
}

/** The caller's own conversations in a workspace, the most recently touched first. */
export async function listConversations(
	db: Pool,
	{ ownerId, workspaceId, limit }: { ownerId: string; workspaceId: string; limit: number },
): Promise<ConversationRow[]> {
	const capped = Math.min(Math.max(1, Math.trunc(limit)), 50);
	const result = await db.query<ConversationRow>(
		`select ${CONVERSATION_COLUMNS}
		 from public.ai_conversations
		 where owner_id = $1 and workspace_id = $2 and archived_at is null
		 order by updated_at desc, created_at desc
		 limit $3`,
		[ownerId, workspaceId, capped],
	);
	return result.rows;
}

/** One conversation, but only when the caller owns it. */
export async function getOwnedConversation(
	db: Pool,
	{ id, ownerId }: { id: string; ownerId: string },
): Promise<ConversationRow | null> {
	const result = await db.query<ConversationRow>(
		`select ${CONVERSATION_COLUMNS}
		 from public.ai_conversations
		 where id = $1 and owner_id = $2
		 limit 1`,
		[id, ownerId],
	);
	return result.rows[0] ?? null;
}

/**
 * The transcript of a conversation the caller owns. The join on the owner is what
 * makes a foreign conversation an empty list instead of somebody else's transcript.
 */
export async function listMessages(
	db: Pool,
	{ conversationId, ownerId }: { conversationId: string; ownerId: string },
): Promise<MessageRow[]> {
	const result = await db.query<MessageRow>(
		`select ${MESSAGE_COLUMNS.split(', ').map((column) => `m.${column}`).join(', ')}
		 from public.ai_messages m
		 join public.ai_conversations c on c.id = m.conversation_id
		 where m.conversation_id = $1 and c.owner_id = $2
		 order by m.created_at asc, m.id asc`,
		[conversationId, ownerId],
	);
	return result.rows;
}

/**
 * A message appended to a conversation the caller owns. The insert selects the
 * conversation through its owner, so a foreign conversation gets no row at all:
 * the call is refused instead of writing into somebody else's thread.
 */
export async function appendMessage(
	db: Pool,
	{
		conversationId,
		ownerId,
		role,
		parts,
		model,
		runId,
		usage,
	}: {
		conversationId: string;
		ownerId: string;
		role: MessageRole;
		parts: unknown[];
		model?: string;
		runId?: string;
		usage?: unknown;
	},
): Promise<MessageRow | null> {
	const result = await db.query<MessageRow>(
		`insert into public.ai_messages (conversation_id, run_id, role, parts, model, usage)
		 select c.id, $3, $4, $5::jsonb, $6, $7::jsonb
		 from public.ai_conversations c
		 where c.id = $1 and c.owner_id = $2
		 returning ${MESSAGE_COLUMNS}`,
		[
			conversationId,
			ownerId,
			runId ?? null,
			role,
			JSON.stringify(parts),
			model ?? null,
			usage === undefined ? null : JSON.stringify(usage),
		],
	);
	return result.rows[0] ?? null;
}

/** A conversation touched now: the inbox lists the most recently touched first. */
export async function touchConversation(db: Pool, conversationId: string): Promise<void> {
	await db.query('update public.ai_conversations set updated_at = now() where id = $1', [conversationId]);
}

/**
 * The titles that mean "the user did not name this conversation": the empty
 * one the service writes, and the default the app shows.
 */
const UNTITLED_TITLES = ['', 'New conversation'];

/** The longest title a conversation takes, the ellipsis aside. */
const TITLE_MAX_CHARS = 60;

/**
 * The title of a conversation that has none: the first question, on one line.
 *
 * The text is cut at a word boundary, so the title ends on a word and not in
 * the middle of one, and the ellipsis says that there was more.
 */
export function titleFromQuestion(text: string): string {
	const collapsed = text.replace(/\s+/g, ' ').trim();
	if (collapsed.length <= TITLE_MAX_CHARS) return collapsed;
	const cut = collapsed.slice(0, TITLE_MAX_CHARS);
	const boundary = cut.lastIndexOf(' ');
	// A word longer than the title: there is no boundary to cut on.
	const head = boundary > 0 ? cut.slice(0, boundary) : cut;
	return `${head.trimEnd()}…`;
}

/**
 * The title of a conversation, when it has none: the first question.
 *
 * A title the user set stays: only the empty title and the default one are
 * replaced, and only by the first run.
 */
async function setTitleIfUntitled(
	client: PoolClient,
	{ conversationId, ownerId, title }: { conversationId: string; ownerId: string; title: string },
): Promise<string> {
	const current = await client.query<ConversationRow>(
		`select ${CONVERSATION_COLUMNS} from public.ai_conversations where id = $1 and owner_id = $2 limit 1`,
		[conversationId, ownerId],
	);
	const row = current.rows[0];
	if (!row) return '';
	if (!title || !UNTITLED_TITLES.includes(row.title)) return row.title;
	const updated = await client.query<ConversationRow>(
		`update public.ai_conversations set title = $2, updated_at = now()
		 where id = $1 and owner_id = $3
		 returning ${CONVERSATION_COLUMNS}`,
		[conversationId, title, ownerId],
	);
	return updated.rows[0]?.title ?? title;
}

/**
 * A user's turn, and the title of the conversation when it has none.
 *
 * The message and the title are written in ONE transaction: a conversation
 * that keeps its first question but stays untitled would read "New
 * conversation" in the inbox forever.
 *
 * A foreign conversation gets no row at all: the call is refused instead of
 * writing into somebody else's thread.
 */
export async function appendUserTurn(
	db: Pool,
	{
		conversationId,
		ownerId,
		parts,
		runId,
		text,
	}: {
		conversationId: string;
		ownerId: string;
		parts: unknown[];
		runId?: string;
		text: string;
	},
): Promise<{ message: MessageRow | null; title: string }> {
	const client = await db.connect();
	try {
		await client.query('begin');
		const inserted = await client.query<MessageRow>(
			`insert into public.ai_messages (conversation_id, run_id, role, parts)
			 select c.id, $3, 'user', $4::jsonb
			 from public.ai_conversations c
			 where c.id = $1 and c.owner_id = $2
			 returning ${MESSAGE_COLUMNS}`,
			[conversationId, ownerId, runId ?? null, JSON.stringify(parts)],
		);
		const message = inserted.rows[0] ?? null;
		if (!message) {
			await client.query('rollback');
			return { message: null, title: '' };
		}
		const title = await setTitleIfUntitled(client, {
			conversationId,
			ownerId,
			title: titleFromQuestion(text),
		});
		await client.query('commit');
		return { message, title };
	} catch (error) {
		await client.query('rollback').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { templateProblem } from '../commands/userCommands.ts';
import { inTransaction } from '../db.ts';

/**
 * The AI context items in the database (models/osionos-ai-context-migration.sql):
 * a user's own skills, rules and slash commands (U1 C1000-C1015, U2
 * C1100-C1110), and a workspace's rules.
 *
 * Every write is ONE transaction: the row change and one ai_context_item_audit
 * row. The count of active items is checked inside it, under an advisory lock
 * per owner or per workspace, so two creates cannot both pass the cap (C1011).
 * A user row's audit keeps its kind, body length and body digest only — no
 * text and no owner (C1008): the row goes on erasure, the audit cannot.
 * Who may write is the route's rule, not this file's.
 */

export type ContextKind = 'skill' | 'rule' | 'command';

export const MAX_USER_SKILLS = 12;
export const MAX_USER_RULES = 10;
export const MAX_USER_COMMANDS = 20;
export const MAX_WORKSPACE_RULES = 8;
/** The longest rule body; the table's CHECK is the second wall. */
export const RULE_BODY_MAX = 1200;

export interface ContextItem {
	id: string;
	kind: ContextKind;
	scope: 'user' | 'workspace';
	owner_id: string | null;
	workspace_id: string | null;
	slug: string;
	name: string;
	description: string;
	body: string;
	version: number;
	created_by: string;
	updated_by: string;
	created_at: Date;
	updated_at: Date;
	archived_at: Date | null;
}

export interface ContextFields {
	name: string;
	description: string;
	body: string;
}

/** Whose items: one user's own, or one workspace's rules. */
export type ContextOwner = { scope: 'user'; ownerId: string } | { scope: 'workspace'; workspaceId: string };

/**
 * One active item of an owner: by id among the kinds the deployment serves
 * (user routes: a kind whose flag is off is not found), or by kind and slug
 * (workspace routes).
 */
export type ItemRef = { id: string; kinds: readonly ContextKind[] } | { kind: ContextKind; slug: string };

const COLUMNS =
	'id, kind, scope, owner_id, workspace_id, slug, name, description, body, version, created_by, updated_by, created_at, updated_at, archived_at';

function ownerClause(owner: ContextOwner): { sql: string; value: string } {
	return owner.scope === 'user'
		? { sql: "scope = 'user' and owner_id = $1", value: owner.ownerId }
		: { sql: "scope = 'workspace' and workspace_id = $1", value: owner.workspaceId };
}

function lockKey(owner: ContextOwner): string {
	return owner.scope === 'user' ? `ai_context:user:${owner.ownerId}` : `ai_context:ws:${owner.workspaceId}`;
}

/** The cap of active items of that kind for that owner; a workspace holds rules only. */
export function capOf(owner: ContextOwner, kind: ContextKind): number {
	if (owner.scope === 'workspace') return kind === 'rule' ? MAX_WORKSPACE_RULES : 0;
	if (kind === 'command') return MAX_USER_COMMANDS;
	return kind === 'skill' ? MAX_USER_SKILLS : MAX_USER_RULES;
}

/**
 * The active items of those kinds of an owner, by kind then slug. The caps
 * bound the list and the LIMIT is their sum: one kind can never crowd another
 * out (C1100, 'command' sorts first). No kind, no query.
 */
export async function listActiveItems(db: Pool, owner: ContextOwner, kinds: readonly ContextKind[]): Promise<ContextItem[]> {
	if (kinds.length === 0) return [];
	const where = ownerClause(owner);
	const limit = kinds.reduce((sum, kind) => sum + capOf(owner, kind), 0);
	const result = await db.query<ContextItem>(
		`select ${COLUMNS} from public.ai_context_items
		 where ${where.sql} and kind = any($2::text[]) and archived_at is null
		 order by kind, slug limit ${limit}`,
		[where.value, kinds],
	);
	return result.rows;
}

const AUDIT_SQL = `
	insert into public.ai_context_item_audit (item_id, scope, workspace_id, version, action, actor_id, before, after)
	values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`;

/** The item as the audit keeps it: a workspace row whole, a user row as kind, length and digest (C1008). */
function auditView(item: ContextItem): string {
	if (item.scope === 'workspace') return JSON.stringify(item);
	const digest = createHash('sha256').update(item.body).digest('hex');
	return JSON.stringify({ kind: item.kind, body_length: item.body.length, body_sha256: digest });
}

async function audit(
	client: PoolClient,
	action: 'create' | 'update' | 'archive',
	actorId: string,
	before: ContextItem | null,
	after: ContextItem,
): Promise<void> {
	await client.query(AUDIT_SQL, [
		after.id,
		after.scope,
		after.workspace_id,
		after.version,
		action,
		actorId,
		before ? auditView(before) : null,
		auditView(after),
	]);
}

export type CreateOutcome = { kind: 'created'; item: ContextItem } | { kind: 'limit' } | { kind: 'exists' } | { kind: 'unavailable' };

/** A new item at version 1, unless the owner is at the cap or the slug of that kind is taken. */
export async function createItem(
	db: Pool,
	input: ContextFields & { owner: ContextOwner; kind: ContextKind; slug: string; actorId: string },
): Promise<CreateOutcome> {
	const { owner } = input;
	try {
		return await inTransaction(db, async (client) => {
			await client.query('select pg_advisory_xact_lock(hashtextextended($1::text, 0))', [lockKey(owner)]);
			const where = ownerClause(owner);
			const count = await client.query<{ n: number }>(
				`select count(*)::int as n from public.ai_context_items where ${where.sql} and kind = $2 and archived_at is null`,
				[where.value, input.kind],
			);
			if ((count.rows[0]?.n ?? 0) >= capOf(owner, input.kind)) return { kind: 'limit' } as const;
			const inserted = await client.query<ContextItem>(
				`insert into public.ai_context_items
				   (kind, scope, owner_id, workspace_id, slug, name, description, body, created_by, updated_by)
				 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) returning ${COLUMNS}`,
				[
					input.kind,
					owner.scope,
					owner.scope === 'user' ? owner.ownerId : null,
					owner.scope === 'workspace' ? owner.workspaceId : null,
					input.slug,
					input.name,
					input.description,
					input.body,
					input.actorId,
				],
			);
			const item = inserted.rows[0] as ContextItem;
			await audit(client, 'create', input.actorId, null, item);
			return { kind: 'created', item } as const;
		});
	} catch (error) {
		const { code, constraint } = error as { code?: unknown; constraint?: unknown };
		if (code === '23505') return { kind: 'exists' };
		// C1107: the kind is served before its migration ran on this database.
		if (code === '23514' && constraint === 'ai_context_items_kind_check') return { kind: 'unavailable' };
		throw error;
	}
}

export type ChangeOutcome = { kind: 'changed'; item: ContextItem } | { kind: 'missing' } | { kind: 'too_long' } | { kind: 'bad_template' };

/** The active item of that owner, locked, or null: another owner's id is null too (C1003). */
async function lockActive(client: PoolClient, owner: ContextOwner, ref: ItemRef): Promise<ContextItem | null> {
	const where = ownerClause(owner);
	const [match, params] =
		'id' in ref ? ['id = $2 and kind = any($3::text[])', [where.value, ref.id, ref.kinds]] : ['kind = $2 and slug = $3', [where.value, ref.kind, ref.slug]];
	const result = await client.query<ContextItem>(
		`select ${COLUMNS} from public.ai_context_items
		 where ${where.sql} and ${match} and archived_at is null for update`,
		params,
	);
	return result.rows[0] ?? null;
}

/** Replaces name, description and body; the version goes up by one. A rule keeps its shorter cap, a command its one $ARGUMENTS. */
export async function updateItem(
	db: Pool,
	input: ContextFields & { owner: ContextOwner; ref: ItemRef; actorId: string },
): Promise<ChangeOutcome> {
	return inTransaction(db, async (client) => {
		const before = await lockActive(client, input.owner, input.ref);
		if (!before) return { kind: 'missing' } as const;
		if (before.kind === 'rule' && input.body.length > RULE_BODY_MAX) return { kind: 'too_long' } as const;
		if (before.kind === 'command' && templateProblem(input.body)) return { kind: 'bad_template' } as const;
		const updated = await client.query<ContextItem>(
			`update public.ai_context_items
			 set name = $2, description = $3, body = $4, version = version + 1, updated_by = $5, updated_at = now()
			 where id = $1 returning ${COLUMNS}`,
			[before.id, input.name, input.description, input.body, input.actorId],
		);
		const item = updated.rows[0] as ContextItem;
		await audit(client, 'update', input.actorId, before, item);
		return { kind: 'changed', item } as const;
	});
}

/** Archives the item (the row stays for the audit); the version goes up by one. */
export async function archiveItem(
	db: Pool,
	input: { owner: ContextOwner; ref: ItemRef; actorId: string },
): Promise<ChangeOutcome> {
	return inTransaction(db, async (client) => {
		const before = await lockActive(client, input.owner, input.ref);
		if (!before) return { kind: 'missing' } as const;
		const updated = await client.query<ContextItem>(
			`update public.ai_context_items
			 set archived_at = now(), version = version + 1, updated_by = $2, updated_at = now()
			 where id = $1 returning ${COLUMNS}`,
			[before.id, input.actorId],
		);
		const item = updated.rows[0] as ContextItem;
		await audit(client, 'archive', input.actorId, before, item);
		return { kind: 'changed', item } as const;
	});
}

/**
 * The body of a user skill a run listed, at load time (C1003, C1009): only
 * the run user's own active skill, and only at the listed version. The audit
 * keeps no user text, so an edit or archive after the index was built
 * RETRACTS the skill for the rest of the run: null, logged.
 */
export async function loadUserSkillBody(
	db: Pool,
	input: { ownerId: string; itemId: string; version: number },
): Promise<string | null> {
	const result = await db.query<{ version: number; body: string }>(
		`select version, body from public.ai_context_items
		 where id = $1 and owner_id = $2 and scope = 'user' and kind = 'skill' and archived_at is null`,
		[input.itemId, input.ownerId],
	);
	const row = result.rows[0];
	if (row && row.version === input.version) return row.body;
	console.warn(JSON.stringify({ event: 'user_skill_retracted', itemId: input.itemId, listed: input.version }));
	return null;
}

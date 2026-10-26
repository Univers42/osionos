import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { inTransaction } from '../db.ts';

/**
 * The custom agents in the database (models/osionos-ai-runs-agents-migration.sql).
 *
 * Every write is ONE transaction under an advisory lock: the row change, the
 * version bump and one `ai_agents_audit` row with the whole row in `after`
 * (C322). The caps are counted under the same lock, so two creates cannot both
 * pass them (C318). Who may write is the route's rule, not this file's.
 *
 * The instructions are prompt text: no line of this file logs them (C323).
 */

/** The most active agents of one user, and of one workspace (C318). */
export const MAX_USER_AGENTS = 20;
export const MAX_WORKSPACE_AGENTS = 8;

/** The row as the service reads it, from the table or from the audit. */
export const storedAgentSchema = z.object({
	id: z.string().uuid(),
	scope: z.enum(['user', 'workspace']),
	owner_id: z.string().uuid().nullable(),
	workspace_id: z.string().uuid().nullable(),
	name: z.string().min(1),
	description: z.string(),
	instructions: z.string().min(1),
	tools: z.array(z.string()),
	skills: z.array(z.string()),
	version: z.number().int().min(1),
	created_by: z.string().uuid(),
	updated_by: z.string().uuid(),
	archived_at: z.union([z.string(), z.date()]).nullable(),
});

export type StoredAgent = z.infer<typeof storedAgentSchema>;

/** What an author writes: the only fields a client can set (C332). */
export interface AgentFields {
	name: string;
	description: string;
	instructions: string;
	tools: string[];
	skills: string[];
}

const COLUMNS =
	'id, scope, owner_id, workspace_id, name, description, instructions, tools, skills, version, created_by, updated_by, archived_at';

/** One agent, archived or not, or null. */
export async function getAgent(db: Pool | PoolClient, id: string): Promise<StoredAgent | null> {
	const result = await db.query(`select ${COLUMNS} from public.ai_agents where id = $1`, [id]);
	const row = result.rows[0];
	return row ? storedAgentSchema.parse(row) : null;
}

/** The active agents the caller owns, and the active agents of the given workspaces. */
export async function listAgents(db: Pool, userId: string, workspaceIds: readonly string[]): Promise<StoredAgent[]> {
	const result = await db.query(
		`select ${COLUMNS} from public.ai_agents
		 where archived_at is null
		   and ((scope = 'user' and owner_id = $1) or (scope = 'workspace' and workspace_id = any($2::uuid[])))
		 order by scope, lower(name), id
		 limit ${MAX_USER_AGENTS + 8 * Math.max(workspaceIds.length, 1)}`,
		[userId, workspaceIds],
	);
	return result.rows.map((row) => storedAgentSchema.parse(row));
}

const AUDIT_SQL = `
	insert into public.ai_agents_audit (agent_id, version, action, actor_id, before, after)
	values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`;

/** The row as the audit keeps it: dates as strings, no key dropped. */
function snapshot(row: StoredAgent): string {
	return JSON.stringify(row);
}

async function lock(client: PoolClient, key: string): Promise<void> {
	await client.query('select pg_advisory_xact_lock(hashtextextended($1::text, 0))', [key]);
}

export type CreateInput = AgentFields & {
	scope: 'user' | 'workspace';
	ownerId: string | null;
	workspaceId: string | null;
	actorId: string;
};

export type CreateOutcome = { kind: 'created'; agent: StoredAgent } | { kind: 'limit' };

/** A new agent at version 1, unless the owner (the user or the workspace) is full. */
export async function createAgent(db: Pool, input: CreateInput): Promise<CreateOutcome> {
	const isUser = input.scope === 'user';
	const owner = (isUser ? input.ownerId : input.workspaceId) as string;
	return inTransaction(db, async (client) => {
		await lock(client, `ai_agents:${input.scope}:${owner}`);
		const count = await client.query<{ n: number }>(
			`select count(*)::int as n from public.ai_agents
			 where scope = $1 and archived_at is null and ${isUser ? 'owner_id' : 'workspace_id'} = $2`,
			[input.scope, owner],
		);
		const cap = isUser ? MAX_USER_AGENTS : MAX_WORKSPACE_AGENTS;
		if ((count.rows[0]?.n ?? 0) >= cap) return { kind: 'limit' } as const;
		const inserted = await client.query(
			`insert into public.ai_agents
			   (scope, owner_id, workspace_id, name, description, instructions, tools, skills, created_by, updated_by)
			 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) returning ${COLUMNS}`,
			[
				input.scope,
				input.ownerId,
				input.workspaceId,
				input.name,
				input.description,
				input.instructions,
				input.tools,
				input.skills,
				input.actorId,
			],
		);
		const agent = storedAgentSchema.parse(inserted.rows[0]);
		await client.query(AUDIT_SQL, [agent.id, agent.version, 'create', input.actorId, null, snapshot(agent)]);
		console.info(JSON.stringify({ event: 'agent_written', action: 'create', agentId: agent.id, version: agent.version, instructionsLength: agent.instructions.length }));
		return { kind: 'created', agent } as const;
	});
}

export type ChangeOutcome =
	| { kind: 'changed'; agent: StoredAgent }
	| { kind: 'missing' }
	| { kind: 'archived' }
	| { kind: 'conflict'; currentVersion: number };

/** The agent, locked, in the transaction of the write. */
async function lockRow(client: PoolClient, id: string): Promise<StoredAgent | null> {
	await lock(client, `ai_agents:row:${id}`);
	const result = await client.query(`select ${COLUMNS} from public.ai_agents where id = $1 for update`, [id]);
	return result.rows[0] ? storedAgentSchema.parse(result.rows[0]) : null;
}

/** Replaces the fields; the version goes up by one. A stale `expectedVersion` is a conflict. */
export async function updateAgent(
	db: Pool,
	input: { id: string; expectedVersion: number; fields: AgentFields; actorId: string },
): Promise<ChangeOutcome> {
	return inTransaction(db, async (client) => {
		const before = await lockRow(client, input.id);
		if (!before) return { kind: 'missing' } as const;
		if (before.archived_at !== null) return { kind: 'archived' } as const;
		if (before.version !== input.expectedVersion) return { kind: 'conflict', currentVersion: before.version } as const;
		const updated = await client.query(
			`update public.ai_agents
			 set name = $2, description = $3, instructions = $4, tools = $5, skills = $6,
			     version = version + 1, updated_by = $7, updated_at = now()
			 where id = $1 returning ${COLUMNS}`,
			[input.id, input.fields.name, input.fields.description, input.fields.instructions, input.fields.tools, input.fields.skills, input.actorId],
		);
		const agent = storedAgentSchema.parse(updated.rows[0]);
		await client.query(AUDIT_SQL, [agent.id, agent.version, 'update', input.actorId, snapshot(before), snapshot(agent)]);
		console.info(JSON.stringify({ event: 'agent_written', action: 'update', agentId: agent.id, version: agent.version, instructionsLength: agent.instructions.length }));
		return { kind: 'changed', agent } as const;
	});
}

/** Archives the agent (the row stays, for the audit and for pinned runs); terminal in v1. */
export async function archiveAgent(db: Pool, input: { id: string; actorId: string }): Promise<ChangeOutcome> {
	return inTransaction(db, async (client) => {
		const before = await lockRow(client, input.id);
		if (!before) return { kind: 'missing' } as const;
		if (before.archived_at !== null) return { kind: 'archived' } as const;
		const updated = await client.query(
			`update public.ai_agents
			 set archived_at = now(), version = version + 1, updated_by = $2, updated_at = now()
			 where id = $1 returning ${COLUMNS}`,
			[input.id, input.actorId],
		);
		const agent = storedAgentSchema.parse(updated.rows[0]);
		await client.query(AUDIT_SQL, [agent.id, agent.version, 'archive', input.actorId, snapshot(before), snapshot(agent)]);
		console.info(JSON.stringify({ event: 'agent_written', action: 'archive', agentId: agent.id, version: agent.version }));
		return { kind: 'changed', agent } as const;
	});
}

/** A version of an agent, and who wrote it. */
export interface PinnedVersion {
	agent: StoredAgent;
	/** The user who wrote THIS version (C333): the audit actor, or `updated_by` of the live row. */
	authorId: string;
}

/**
 * The exact version a run pinned (C301): the live row when its version matches,
 * else the `after` of the audit row that wrote it.
 *
 * It never filters on archived (C313): an archived agent's pinned versions
 * still load. Null when the row is missing or does not parse; a database error
 * throws, and the caller treats both as a refusal.
 */
export async function loadPinnedVersion(
	db: Pool,
	{ agentId, version }: { agentId: string; version: number },
): Promise<PinnedVersion | null> {
	const current = await getAgent(db, agentId);
	if (current && current.version === version) return { agent: current, authorId: current.updated_by };
	const result = await db.query<{ actor_id: string; after: unknown }>(
		`select actor_id, after from public.ai_agents_audit
		 where agent_id = $1 and version = $2 and action in ('create', 'update') limit 1`,
		[agentId, version],
	);
	const row = result.rows[0];
	if (!row) return null;
	const parsed = storedAgentSchema.safeParse(row.after);
	if (!parsed.success || parsed.data.id !== agentId || parsed.data.version !== version) {
		console.warn(JSON.stringify({ event: 'agent_audit_unparsable', agentId, version }));
		return null;
	}
	return { agent: parsed.data, authorId: row.actor_id };
}

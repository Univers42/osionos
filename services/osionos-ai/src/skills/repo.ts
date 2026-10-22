import type { Pool, PoolClient } from 'pg';

/**
 * The workspace skills in the database (models/osionos-ai-skills-migration.sql).
 *
 * Every write is ONE transaction: the row change and one `ai_skill_audit` row
 * with the whole row before and after and the new version (devil C40). The
 * count of active skills is checked inside the same transaction, under an
 * advisory lock per workspace, so two creates cannot both pass the limit
 * (devil C47). Who may write is the route's rule, not this file's.
 */

/** The most active skills a workspace holds: with the index cap, the bound of the prefix (C47). */
export const MAX_ACTIVE_SKILLS = 8;

export interface WorkspaceSkill {
	id: string;
	workspace_id: string;
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

export interface SkillFields {
	name: string;
	description: string;
	body: string;
}

const COLUMNS =
	'id, workspace_id, slug, name, description, body, version, created_by, updated_by, created_at, updated_at, archived_at';

/** The active skills of a workspace, by slug. At most MAX_ACTIVE_SKILLS exist; the LIMIT is the second wall. */
export async function listActiveSkills(db: Pool, workspaceId: string): Promise<WorkspaceSkill[]> {
	const result = await db.query<WorkspaceSkill>(
		`select ${COLUMNS} from public.ai_skills
		 where workspace_id = $1 and archived_at is null
		 order by slug limit ${MAX_ACTIVE_SKILLS}`,
		[workspaceId],
	);
	return result.rows;
}

const AUDIT_SQL = `
	insert into public.ai_skill_audit (skill_id, workspace_id, version, action, actor_id, before, after)
	values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`;

/** The row as the audit keeps it: dates as strings, nothing else dropped. */
function snapshot(row: WorkspaceSkill): string {
	return JSON.stringify(row);
}

/** Runs `work` in a transaction; the client is released on every path. */
async function inTransaction<T>(db: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
	const client = await db.connect();
	try {
		await client.query('begin');
		const out = await work(client);
		await client.query('commit');
		return out;
	} catch (error) {
		await client.query('rollback').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

export type CreateOutcome =
	| { kind: 'created'; skill: WorkspaceSkill }
	| { kind: 'limit' }
	| { kind: 'exists' };

/** A new skill at version 1, unless the workspace is full or the slug is taken. */
export async function createSkill(
	db: Pool,
	input: SkillFields & { workspaceId: string; slug: string; actorId: string },
): Promise<CreateOutcome> {
	try {
		return await inTransaction(db, async (client) => {
			await client.query('select pg_advisory_xact_lock(hashtextextended($1::text, 0))', [`ai_skills:${input.workspaceId}`]);
			const count = await client.query<{ n: number }>(
				'select count(*)::int as n from public.ai_skills where workspace_id = $1 and archived_at is null',
				[input.workspaceId],
			);
			if ((count.rows[0]?.n ?? 0) >= MAX_ACTIVE_SKILLS) return { kind: 'limit' } as const;
			const inserted = await client.query<WorkspaceSkill>(
				`insert into public.ai_skills (workspace_id, slug, name, description, body, created_by, updated_by)
				 values ($1, $2, $3, $4, $5, $6, $6) returning ${COLUMNS}`,
				[input.workspaceId, input.slug, input.name, input.description, input.body, input.actorId],
			);
			const skill = inserted.rows[0] as WorkspaceSkill;
			await client.query(AUDIT_SQL, [skill.id, skill.workspace_id, skill.version, 'create', input.actorId, null, snapshot(skill)]);
			return { kind: 'created', skill } as const;
		});
	} catch (error) {
		if ((error as { code?: unknown }).code === '23505') return { kind: 'exists' };
		throw error;
	}
}

export type ChangeOutcome = { kind: 'changed'; skill: WorkspaceSkill } | { kind: 'missing' };

/** The active skill of that slug, locked, or null. */
async function lockActive(client: PoolClient, workspaceId: string, slug: string): Promise<WorkspaceSkill | null> {
	const result = await client.query<WorkspaceSkill>(
		`select ${COLUMNS} from public.ai_skills
		 where workspace_id = $1 and slug = $2 and archived_at is null for update`,
		[workspaceId, slug],
	);
	return result.rows[0] ?? null;
}

/** Replaces name, description and body; the version goes up by one. */
export async function updateSkill(
	db: Pool,
	input: SkillFields & { workspaceId: string; slug: string; actorId: string },
): Promise<ChangeOutcome> {
	return inTransaction(db, async (client) => {
		const before = await lockActive(client, input.workspaceId, input.slug);
		if (!before) return { kind: 'missing' } as const;
		const updated = await client.query<WorkspaceSkill>(
			`update public.ai_skills
			 set name = $2, description = $3, body = $4, version = version + 1, updated_by = $5, updated_at = now()
			 where id = $1 returning ${COLUMNS}`,
			[before.id, input.name, input.description, input.body, input.actorId],
		);
		const skill = updated.rows[0] as WorkspaceSkill;
		await client.query(AUDIT_SQL, [skill.id, skill.workspace_id, skill.version, 'update', input.actorId, snapshot(before), snapshot(skill)]);
		return { kind: 'changed', skill } as const;
	});
}

/** Archives the skill (the row stays, for the audit and for pinned runs); the version goes up by one. */
export async function archiveSkill(
	db: Pool,
	input: { workspaceId: string; slug: string; actorId: string },
): Promise<ChangeOutcome> {
	return inTransaction(db, async (client) => {
		const before = await lockActive(client, input.workspaceId, input.slug);
		if (!before) return { kind: 'missing' } as const;
		const updated = await client.query<WorkspaceSkill>(
			`update public.ai_skills
			 set archived_at = now(), version = version + 1, updated_by = $2, updated_at = now()
			 where id = $1 returning ${COLUMNS}`,
			[before.id, input.actorId],
		);
		const skill = updated.rows[0] as WorkspaceSkill;
		await client.query(AUDIT_SQL, [skill.id, skill.workspace_id, skill.version, 'archive', input.actorId, snapshot(before), snapshot(skill)]);
		return { kind: 'changed', skill } as const;
	});
}

/**
 * The text of the version a run LISTED, at load time.
 *
 * An archived skill is retracted: null, whatever the run listed. A skill
 * edited after the index was built still answers with the listed version,
 * read from the `after` of its audit row (the audit keeps whole rows) —
 * the run does not silently switch to text its index never described.
 * Null when that version cannot be found.
 */
export async function loadListedVersion(
	db: Pool,
	input: { workspaceId: string; skillId: string; version: number },
): Promise<string | null> {
	const current = await db.query<{ version: number; body: string }>(
		'select version, body from public.ai_skills where id = $1 and workspace_id = $2 and archived_at is null',
		[input.skillId, input.workspaceId],
	);
	const row = current.rows[0];
	if (!row) return null;
	if (row.version === input.version) return row.body;
	const audit = await db.query<{ body: unknown }>(
		`select after->>'body' as body from public.ai_skill_audit
		 where skill_id = $1 and workspace_id = $2 and version = $3 and action in ('create', 'update', 'restore')
		 limit 1`,
		[input.skillId, input.workspaceId, input.version],
	);
	const body = audit.rows[0]?.body;
	return typeof body === 'string' ? body : null;
}

/** One skill a run loaded, as ai_runs.skill_pins keeps it (devil C40). */
export interface SkillPin {
	id: string;
	version: number;
	source: 'builtin' | 'workspace';
}

/** Appends the pin to the run, once: a pin the run already holds is not repeated. */
export async function recordSkillPin(db: Pool, runId: string, pin: SkillPin): Promise<void> {
	const one = JSON.stringify([pin]);
	await db.query(
		`update public.ai_runs
		 set skill_pins = coalesce(skill_pins, '[]'::jsonb) || $2::jsonb
		 where id = $1 and not (coalesce(skill_pins, '[]'::jsonb) @> $2::jsonb)`,
		[runId, one],
	);
}

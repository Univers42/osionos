import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import { startHarness, USER_A, USER_B, WORKSPACE_A } from './harness.ts';

/**
 * The storage of custom agents (D3 slice A + C): the order of the migration,
 * the CHECK on the run, the closed tables, and the erasure of the author.
 *
 * Caveat: the erasure is proved here through ai_agents_erase_user(), the
 * function ai_erase_user() calls. ai_erase_user itself needs feed tables this
 * database does not have; its dispatch is proved by scripts/verify/ai-agents.sh
 * and by the throwaway-container run recorded in the commit.
 */
const { app, mock } = await startHarness();
const db = app.db;

after(async () => {
	// The database is shared with other files: a leaked ai_runs row breaks their counts.
	await db.query('delete from public.ai_runs where id = any($1::uuid[])', [[RUN_OK, RUN_BAD, RUN_BOTH]]);
	await app.close();
	await mock.close();
});

const TOMBSTONE = '00000000-0000-4000-8000-000000000000';
const USER_AGENT = '44444444-4444-4444-8444-444444444441';
const WORKSPACE_AGENT = '44444444-4444-4444-8444-444444444442';
const OTHER_AGENT = '44444444-4444-4444-8444-444444444443';
const RUN_OK = '66666666-6666-4666-8666-666666666661';
const RUN_BAD = '66666666-6666-4666-8666-666666666662';
const RUN_BOTH = '66666666-6666-4666-8666-666666666663';

/** Postgres refused the statement with this constraint. */
async function refusedBy(sql: string, params: unknown[], constraint: string): Promise<void> {
	await assert.rejects(db.query(sql, params), (error: { constraint?: string; message: string }) => {
		assert.equal(error.constraint, constraint, error.message);
		return true;
	});
}

describe('the migration and its order', () => {
	it('C311: the agents migration is listed after the base AI migration, and sorts after it under LC_ALL=C', () => {
		const names = readFileSync(new URL('../scripts/migrations.txt', import.meta.url), 'utf8')
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line !== '' && !line.startsWith('#'));
		const base = names.indexOf('osionos-ai-migration.sql');
		const agents = names.indexOf('osionos-ai-runs-agents-migration.sql');
		assert.ok(base >= 0 && agents > base, `runner order: base ${base}, agents ${agents}`);
		// Code-unit order is LC_ALL=C order for these ASCII names.
		assert.ok('osionos-ai-runs-agents-migration.sql' > 'osionos-ai-migration.sql');
	});

	it('C310: the ai_runs CHECK exists and is validated', async () => {
		const { rows } = await db.query("select convalidated from pg_constraint where conname = 'ai_runs_custom_agent_check'");
		assert.deepEqual(rows, [{ convalidated: true }]);
	});

	it('C312: the three tables have RLS on and no grant to PUBLIC, anon or authenticated', async () => {
		const { rows } = await db.query(
			`select relname, relrowsecurity, coalesce(relacl::text, '') as acl from pg_class
			  where relname in ('ai_agents', 'ai_agents_audit', 'ai_workspace_agent_settings') and relkind = 'r'`,
		);
		assert.equal(rows.length, 3);
		for (const row of rows) {
			assert.equal(row.relrowsecurity, true, row.relname);
			// An ACL entry with an empty grantee is PUBLIC; anon and authenticated name themselves.
			assert.ok(!/(^|[{,"])(=|anon=|authenticated=)/.test(row.acl), `${row.relname}: ${row.acl}`);
		}
	});
});

describe('the CHECK on the run pin', () => {
	const insert = (id: string, agentId: string | null, customId: string | null, customVersion: number | null) =>
		db.query(
			`insert into public.ai_runs (id, owner_id, status, model, kind, agent_id, agent_version, custom_agent_id, custom_agent_version)
			 values ($1, $2, 'running', 'm', 'image', $3, $4, $5, $6)`,
			[id, USER_A, agentId, agentId ? 1 : null, customId, customVersion],
		);

	it('C337: a custom id with a NULL version is rejected, and a built-in id beside a custom id too', async () => {
		await insert(RUN_OK, null, WORKSPACE_AGENT, 1);
		await refusedBy(
			`insert into public.ai_runs (id, owner_id, status, model, kind, custom_agent_id, custom_agent_version)
			 values ($1, $2, 'running', 'm', 'image', $3, null)`,
			[RUN_BAD, USER_A, WORKSPACE_AGENT],
			'ai_runs_custom_agent_check',
		);
		await refusedBy(
			`insert into public.ai_runs (id, owner_id, status, model, kind, agent_id, agent_version, custom_agent_id, custom_agent_version)
			 values ($1, $2, 'running', 'm', 'image', 'guide', 1, $3, 1)`,
			[RUN_BOTH, USER_A, WORKSPACE_AGENT],
			'ai_runs_custom_agent_check',
		);
	});
});

describe('erasing the author of agents', () => {
	/** Every text of the three tables, one row per line. */
	const dump = async (): Promise<string> => {
		const { rows } = await db.query(
			`select row_to_json(t)::text as s from public.ai_agents t
			 union all select row_to_json(t)::text from public.ai_agents_audit t
			 union all select row_to_json(t)::text from public.ai_workspace_agent_settings t`,
		);
		return rows.map((row) => row.s).join('\n');
	};

	it('C315 C316: a user with a user-scope agent and an authored workspace agent is erased from both scopes', async () => {
		await db.query(
			`insert into public.ai_agents (id, scope, owner_id, workspace_id, name, instructions, created_by, updated_by)
			 values ($1, 'user', $4, null, 'mine', 'i', $4, $4),
			        ($2, 'workspace', null, $5, 'shared', 'i', $4, $4),
			        ($3, 'workspace', null, $5, 'other', 'i', $6, $6)`,
			[USER_AGENT, WORKSPACE_AGENT, OTHER_AGENT, USER_A, WORKSPACE_A, USER_B],
		);
		await db.query(
			`insert into public.ai_agents_audit (agent_id, version, action, actor_id, after)
			 values ($1::uuid, 1, 'create', $4::uuid, jsonb_build_object('id', $1::text, 'owner_id', $4::text, 'version', 1)),
			        ($2::uuid, 1, 'create', $4::uuid, jsonb_build_object('id', $2::text, 'created_by', $4::text, 'updated_by', $4::text, 'instructions', 'i', 'version', 1)),
			        ($3::uuid, 1, 'create', $5::uuid, jsonb_build_object('id', $3::text, 'created_by', $5::text, 'version', 1))`,
			[USER_AGENT, WORKSPACE_AGENT, OTHER_AGENT, USER_A, USER_B],
		);
		await db.query(
			`insert into public.ai_workspace_agent_settings (workspace_id, updated_by) values ($1, $2)
			 on conflict (workspace_id) do update set updated_by = excluded.updated_by`,
			[WORKSPACE_A, USER_A],
		);
		assert.ok((await dump()).includes(USER_A), 'the fixture holds the user');

		const erased = await db.query('select public.ai_agents_erase_user($1) as n', [USER_A]);
		assert.equal(erased.rows[0]?.n, 1);

		// User scope: the agent and its audit are gone.
		assert.equal((await db.query('select 1 from public.ai_agents where id = $1', [USER_AGENT])).rowCount, 0);
		assert.equal((await db.query('select 1 from public.ai_agents_audit where agent_id = $1', [USER_AGENT])).rowCount, 0);
		// Workspace scope: the agent stays, its author is the tombstone.
		const kept = await db.query('select created_by, updated_by from public.ai_agents where id = $1', [WORKSPACE_AGENT]);
		assert.deepEqual(kept.rows, [{ created_by: TOMBSTONE, updated_by: TOMBSTONE }]);
		// The audit is scrubbed, not deleted: same keys, the uuid replaced.
		const audit = await db.query('select actor_id, after from public.ai_agents_audit where agent_id = $1', [WORKSPACE_AGENT]);
		assert.equal(audit.rowCount, 1);
		assert.equal(audit.rows[0].actor_id, TOMBSTONE);
		assert.deepEqual(Object.keys(audit.rows[0].after).sort(), ['created_by', 'id', 'instructions', 'updated_by', 'version']);
		assert.equal(audit.rows[0].after.created_by, TOMBSTONE);
		// C316: no column or jsonb of either scope still holds the uuid.
		assert.ok(!(await dump()).includes(USER_A), 'the erased uuid is nowhere');
		// Another user's rows are untouched.
		const other = await db.query('select created_by from public.ai_agents where id = $1', [OTHER_AGENT]);
		assert.equal(other.rows[0].created_by, USER_B);
	});

	it('C316: a pinned version still parses after the scrub (every key kept, ids still uuids)', async () => {
		const { rows } = await db.query('select version, after from public.ai_agents_audit where agent_id = $1 and version = 1', [WORKSPACE_AGENT]);
		const pinned = rows[0].after;
		assert.equal(typeof pinned.instructions, 'string');
		assert.match(pinned.created_by, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
		assert.equal(pinned.version, 1);
	});

	it('C338: the audit stays append-only outside the erasure', async () => {
		await assert.rejects(db.query('delete from public.ai_agents_audit'), /append-only/);
		await assert.rejects(db.query('update public.ai_agents_audit set version = 9'), /append-only/);
	});
});

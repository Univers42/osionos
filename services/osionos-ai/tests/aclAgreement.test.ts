import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Pool } from 'pg';
import { canReadPageRowAsMember } from '../../../scripts/bridge-page-read.mjs';
import { ROW_ALLOWED_SQL, WORKSPACE_ALLOWED_SQL } from '../src/retrieval/acl.ts';
import { USER_B, USER_C, WORKSPACE_A, WORKSPACE_C, clearPages, seedPage, vectorOf } from './retrievalSeed.ts';

/**
 * The agreement of the two rules.
 *
 * The SQL pre-filter of the retrieval and the bridge's own read rule must
 * answer the same thing on every row: the filter reads a COPY of the
 * permissions (the normalized visibility, the ids of the collaborators that
 * carry a role), and the bridge reads the page itself. This table runs every
 * combination of the two rules and compares them.
 */

const DATABASE_URL = process.env.OSIONOS_AI_DATABASE_URL ?? '';

/** The owner of the pages the callers are not. */
const OTHER = '44444444-4444-4444-8444-444444444444';

const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });

/**
 * The visibilities the rule handles: the three of the schema, and the two it
 * refuses — an unknown value, and NULL. Both are 'private'.
 */
const VISIBILITIES: (string | null)[] = ['private', 'shared', 'public', 'weird', null];

/**
 * The caller's relation to the page: the owner, a collaborator with a role, a
 * collaborator with a null role, a malformed entry, and nobody.
 */
const RELATIONS = ['owner', 'collaborator', 'collaborator_null_role', 'malformed', 'neither'] as const;

/** One row of the table: a page, and the caller that reads it. */
interface Combination {
	visibility: string | null;
	relation: string;
	member: boolean;
	caller: string;
	/** The workspaces of the caller: the token's, and the ones of the members table. */
	workspaces: string[];
	ownerId: string;
	collaborators: unknown[];
}

/** The ACL of a page, for the caller's relation to it. */
function aclFor(relation: string, caller: string): { ownerId: string; collaborators: unknown[] } {
	if (relation === 'owner') return { ownerId: caller, collaborators: [] };
	if (relation === 'collaborator') {
		return { ownerId: OTHER, collaborators: [{ userId: caller, role: 'editor' }] };
	}
	if (relation === 'collaborator_null_role') {
		return { ownerId: OTHER, collaborators: [{ userId: caller, role: null }] };
	}
	if (relation === 'malformed') {
		// The id of the caller, but the entry carries no role: the rule skips
		// it, and so does the copy of the permissions.
		return {
			ownerId: OTHER,
			collaborators: [{ userId: caller }, 'not-an-object', { userId: 'not-a-uuid', role: 'editor' }],
		};
	}
	return { ownerId: OTHER, collaborators: [] };
}

/** Every combination: the visibilities, the relations, and the membership. */
function combinations(): Combination[] {
	const table: Combination[] = [];
	for (const visibility of VISIBILITIES) {
		for (const relation of RELATIONS) {
			for (const member of [true, false]) {
				// The caller that is a member of the workspace of the pages, and
				// the one that is not.
				const caller = member ? USER_B : USER_C;
				const acl = aclFor(relation, caller);
				table.push({
					visibility,
					relation,
					member,
					caller,
					workspaces: member ? [WORKSPACE_C, WORKSPACE_A] : [WORKSPACE_C],
					ownerId: acl.ownerId,
					collaborators: acl.collaborators,
				});
			}
		}
	}
	return table;
}

/** The chunks of the table, one per combination, with the pages they carry. */
async function seed(table: Combination[]): Promise<Map<string, { combination: Combination; pageId: string; chunkId: string }>> {
	const seeded = new Map<string, { combination: Combination; pageId: string; chunkId: string }>();
	for (const combination of table) {
		const { pageId, chunkId } = await seedPage(pool, {
			workspaceId: WORKSPACE_A,
			ownerId: combination.ownerId,
			title: `Row ${combination.visibility ?? 'null'} ${combination.relation}`,
			visibility: combination.visibility,
			collaborators: combination.collaborators,
			content: 'the text of the row of the table',
			embedding: vectorOf(`row ${combination.relation}`),
		});
		seeded.set(chunkId, { combination, pageId, chunkId });
		pages.push(pageId);
	}
	return seeded;
}

/** What the SQL predicate says about the chunks of one caller. */
async function sqlAnswers(
	rows: { chunkId: string; combination: Combination }[],
): Promise<Map<string, boolean>> {
	const answers = new Map<string, boolean>();
	for (const caller of [USER_B, USER_C]) {
		const ids = rows.filter((row) => row.combination.caller === caller).map((row) => row.chunkId);
		if (ids.length === 0) continue;
		const workspaces = caller === USER_B ? [WORKSPACE_C, WORKSPACE_A] : [WORKSPACE_C];
		const result = await pool.query<{ id: string; allowed: boolean }>(
			`select c.id, (${WORKSPACE_ALLOWED_SQL} and ${ROW_ALLOWED_SQL}) as allowed
			 from public.ai_chunks c
			 where c.id = any($3::bigint[])`,
			[workspaces, caller, ids],
		);
		for (const row of result.rows) answers.set(String(row.id), row.allowed === true);
	}
	return answers;
}

/** The pages of the table: they are gone when the test is over. */
const pages: string[] = [];

/** Whether the RAG migration is applied: the chunks are its table. */
const rag = await pool.query(
	"select to_regclass('public.ai_chunks') as chunks, to_regclass('public.osionos_workspace_members') as members",
);
const hasRag = Boolean(rag.rows[0]?.chunks) && Boolean(rag.rows[0]?.members);

before(async () => {
	if (!hasRag) return;
	// The caller that is a member of the workspace of the pages.
	await pool.query(
		`insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions)
		 values ($1, $2, 'member', array['read'])`,
		[WORKSPACE_A, USER_B],
	);
});

after(async () => {
	if (hasRag) {
		await clearPages(pool, pages);
		await pool.query('delete from public.osionos_workspace_members');
	}
	await pool.end();
});

describe('the ACL of the retrieval', { skip: hasRag ? false : 'the RAG migration was not applied' }, () => {
	it('the SQL predicate and the bridge rule agree on every row of the table', async () => {
		const table = combinations();
		const seeded = await seed(table);
		const rows = [...seeded.values()];
		const sql = await sqlAnswers(rows);

		const mismatches: string[] = [];
		let allowed = 0;
		for (const row of rows) {
			const { combination } = row;
			const page = await pool.query(
				'select id, workspace_id, owner_id, visibility, collaborators from public.osionos_pages where id = $1',
				[row.pageId],
			);
			const pageRow = page.rows[0];
			const byBridge = canReadPageRowAsMember(pageRow, combination.caller, combination.workspaces);
			const bySql = sql.get(row.chunkId) === true;
			if (byBridge) allowed += 1;
			if (byBridge !== bySql) {
				mismatches.push(
					`${combination.visibility ?? 'null'} / ${combination.relation} / member=${combination.member}: sql=${bySql} bridge=${byBridge}`,
				);
			}
		}

		console.log(
			`[acl] truth table: ${table.length} rows (${VISIBILITIES.length} visibilities x ${RELATIONS.length} relations x 2 memberships), ${allowed} readable`,
		);
		assert.deepEqual(mismatches, [], 'the two rules must answer the same');
		// The table is not a table of trues: both answers are in it.
		assert.ok(allowed > 0, 'some rows are readable');
		assert.ok(allowed < table.length, 'some rows are not readable');
	});
});

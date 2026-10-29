import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type { Pool } from 'pg';

/**
 * U1 and U2 both on (C1100, C1102): commands sort before rules and skills, and
 * a full set of them must not crowd a single rule or skill out of a run.
 */
const { startHarness, USER_A, WORKSPACE_A } = await (async () => {
	process.env.OSIONOS_AI_USER_CONTEXT = 'on';
	process.env.OSIONOS_AI_USER_COMMANDS = 'on';
	return import('./harness.ts');
})();
const { app, mock, bridge, call, tokenFor } = await startHarness();
const { MAX_USER_COMMANDS, MAX_USER_RULES, MAX_USER_SKILLS } = await import('../src/context/repo.ts');
const { userContextForRun } = await import('../src/context/runContext.ts');
const { buildSkillIndex } = await import('../src/skills/runSkills.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

async function seedMany(kind: string, count: number): Promise<void> {
	await app.db.query(
		`insert into public.ai_context_items (kind, scope, owner_id, slug, name, description, body, created_by, updated_by)
		 select $1, 'user', $2, $1 || '-' || n, 'n', 'd', 'b', $2, $2 from generate_series(1, $3) as n`,
		[kind, USER_A, count],
	);
}

describe('user context and commands (both flags on)', () => {
	it('C1100: 20 commands leave every rule and skill in the run; the list serves all three kinds', async () => {
		await app.db.query('delete from public.ai_context_items');
		await seedMany('command', MAX_USER_COMMANDS);
		await seedMany('rule', MAX_USER_RULES);
		await seedMany('skill', MAX_USER_SKILLS);
		const user = { userId: USER_A, workspaceId: WORKSPACE_A, memberWorkspaces: [], isAdmin: false, issuedAtMs: 0 };
		const context = await userContextForRun(app.db as Pool, { user, workspaceId: undefined, research: false, skillIndex: buildSkillIndex([], []) });
		assert.equal(context?.included.size, MAX_USER_RULES + MAX_USER_SKILLS);
		assert.deepEqual(context?.dropped, []);
		const listed = ((await call('/api/ai/context/items', { token: tokenFor(USER_A, WORKSPACE_A) })).body as { items: unknown[] }).items;
		assert.equal(listed.length, MAX_USER_COMMANDS + MAX_USER_RULES + MAX_USER_SKILLS);
	});
});

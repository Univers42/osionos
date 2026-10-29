import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import type { Pool } from 'pg';

/**
 * `list_my_context` with OSIONOS_AI_CONTEXT_TOOL unset and every other context
 * flag on (C1141): the run of today, key for key, with no new query.
 */
const { startHarness, USER_A, WORKSPACE_A } = await (async () => {
	for (const name of ['OSIONOS_AI_USER_CONTEXT', 'OSIONOS_AI_USER_COMMANDS', 'OSIONOS_AI_USER_HOOKS', 'OSIONOS_AI_CUSTOM_AGENTS']) process.env[name] = 'on';
	delete process.env.OSIONOS_AI_CONTEXT_TOOL;
	return import('./harness.ts');
})();
const { app, mock, bridge } = await startHarness();
const { buildRunTools } = await import('../src/runs/toolSet.ts');
const { createToolPool, toolDefinitionChars, TOOL_DEFINITION_CHARS } = await import('../src/tools/index.ts');
const { config } = await import('../src/config.ts');
const { baseDefinitions } = await import('./contextToolBase.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

describe('list_my_context (flag off)', () => {
	it('C1141: no tool, no query, and the definitions count is the one before U5', () => {
		assert.equal(config.contextToolEnabled, false);
		const seen: string[] = [];
		const db = { query: (sql: string, values?: unknown[]) => (seen.push(sql), app.db.query(sql, values)) } as unknown as Pool;
		const user = { userId: USER_A, workspaceId: WORKSPACE_A, memberWorkspaces: [], isAdmin: false, issuedAtMs: 0 };
		const built = buildRunTools({
			db, user, pool: createToolPool(), runId: randomUUID(), conversationId: randomUUID(), ownerId: USER_A,
			pages: [], sources: [], workspaceId: WORKSPACE_A, emit: async () => {}, promptItemIds: new Set(['x']),
		});
		assert.ok(built.tools && !('list_my_context' in built.tools));
		assert.equal(seen.length, 0, 'building the tools reads nothing');
		assert.equal(TOOL_DEFINITION_CHARS, toolDefinitionChars(baseDefinitions()));
	});
});

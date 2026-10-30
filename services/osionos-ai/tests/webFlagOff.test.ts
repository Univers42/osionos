import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import type { Pool } from 'pg';
import { serveAi, tokenFor } from './serveAi.ts';

/**
 * OSIONOS_AI_WEB unset (C369, C375): no route, no tool, no reservation, no
 * question to the database about web columns. Its own file: the service reads
 * the flag once, at import.
 */
delete process.env.OSIONOS_AI_WEB;

const base = await serveAi();
const { config } = await import('../src/config.ts');
const { buildRunTools } = await import('../src/runs/toolSet.ts');
const { createToolPool, TOOL_DEFINITION_CHARS } = await import('../src/tools/index.ts');
const { webToolChars } = await import('../src/web/runWeb.ts');
const { influencedBy } = await import('../src/mcpClient/taint.ts');

describe('the web tools with the flag off', () => {
	it('C369 the switch route answers what an unknown route answers', async () => {
		const ask = (path: string) => fetch(`${base}${path}`, { headers: { authorization: `Bearer ${tokenFor(randomUUID())}` } });
		const unknown = await ask('/api/ai/no-such-route');
		const web = await ask(`/api/ai/workspaces/${randomUUID()}/web/settings`);
		assert.equal(config.webEnabled, false);
		assert.equal(web.status, unknown.status);
		assert.equal(web.status, 404);
	});

	it('C369 C375 the run tool set has no web key and the reservation is today\'s', () => {
		const run = buildRunTools({
			db: {} as Pool,
			user: { userId: randomUUID(), workspaceId: randomUUID(), memberWorkspaces: [], isAdmin: false, issuedAtMs: Date.now() },
			pool: createToolPool(),
			runId: randomUUID(),
			conversationId: randomUUID(),
			ownerId: randomUUID(),
			pages: [],
			sources: [],
			emit: async () => {},
		});
		assert.equal(Object.keys(run.tools ?? {}).some((name) => name.startsWith('web_')), false);
		assert.equal(webToolChars(false), 0);
		assert.ok(webToolChars(true) > 0, 'the two definitions have a size when a run offers them');
		// Pinned from main before the web tools (origin/main b3d1f7ccc, builders off: 7048),
		// plus suggest_agent (bots B1: 495 chars), plus add_blocks' code language (#34:
		// 167 chars). A change here moves every reservation.
		assert.equal(TOOL_DEFINITION_CHARS, 7710);
	});

	it('C375 influencedBy never reads the web columns', async () => {
		const seen: string[] = [];
		const db = { query: async (sql: string) => (seen.push(sql), { rows: [] }) } as unknown as Pool;
		assert.deepEqual(await influencedBy(db, randomUUID()), []);
		assert.equal(seen.some((sql) => sql.includes('web_')), false);
	});
});

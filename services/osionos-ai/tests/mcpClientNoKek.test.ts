import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

/**
 * The MCP client on, with no KEK: a header cannot be sealed, so the routes
 * that would take one answer 503 and store nothing (C274).
 */
process.env.OSIONOS_AI_MCP_CLIENT = 'on';
delete process.env.OSIONOS_AI_KEK;
delete process.env.OSIONOS_AI_KEK_ID;
const { startHarness, WORKSPACE_A } = await import('./harness.ts');
const { randomUUID } = await import('node:crypto');
const { app, mock, bridge, tokenFor, call } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

describe('C274 without a KEK nothing is stored', () => {
	it('C274 a registration answers 503 and leaves no row', async () => {
		const user = randomUUID();
		const made = await call('/api/ai/mcp-servers', {
			method: 'POST',
			token: tokenFor(user, WORKSPACE_A),
			body: { label: 'x', url: 'https://example.com/mcp', headerValue: 'abcdefgh1234', acknowledged: true },
		});
		assert.equal(made.status, 503);
		assert.equal(made.body?.code, 'connections_unavailable');
		const rows = await app.db.query('select 1 from public.ai_mcp_servers where owner_id = $1', [user]);
		assert.equal(rows.rows.length, 0);
	});
});

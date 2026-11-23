/**
 * Flag off (OSIONOS_AI_MODES unset): a run start is one UPDATE, reason 'legacy',
 * and no agent, skill or page read. A conversation created while the flag is
 * off must not be left clean for a later allowlisted user.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { startHarness, USER_A, WORKSPACE_A } from './harness.ts';

const { app, mock, bridge, createConversation } = await startHarness();
const { markRunStart } = await import('../src/provenance/runStart.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

describe('run-start provenance, modes flag off', () => {
	it('taints legacy with a single query', async () => {
		const conversationId = await createConversation();
		const user = { userId: USER_A, workspaceId: WORKSPACE_A, memberWorkspaces: [], isAdmin: false, issuedAtMs: Date.now(), expiresAtMs: null };
		const seen: string[] = [];
		const original = app.db.query.bind(app.db);
		(app.db as { query: unknown }).query = (...args: unknown[]) => {
			seen.push(String(args[0]));
			return (original as (...a: unknown[]) => unknown)(...args);
		};
		try {
			const reason = await markRunStart(app.db, {
				conversationId, user, contextPages: [], sources: [], overview: null, viewTabs: [],
				attachmentCount: 0, imageCount: 0, skillIndex: [], customAgentId: randomUUID(), thread: false,
			});
			assert.equal(reason, 'legacy');
		} finally {
			(app.db as { query: unknown }).query = original;
		}
		assert.equal(seen.length, 1);
		assert.match(seen[0], /update public\.ai_conversations/);
		const row = await app.db.query('select provenance_reason from public.ai_conversations where id = $1', [conversationId]);
		assert.equal(row.rows[0].provenance_reason, 'legacy');
	});
});

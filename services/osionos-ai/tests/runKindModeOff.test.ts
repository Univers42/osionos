import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

/** The snapshot with the flag off, or the allowlist empty: always manual. */
delete process.env.OSIONOS_AI_MODES;
delete process.env.OSIONOS_AI_MODES_USERS;

const { startHarness, USER_A, WORKSPACE_A } = await import('./harness.ts');
const { effectiveMode } = await import('../src/modes/effectiveMode.ts');
const { makeRunCredential } = await import('../src/modes/credential.ts');
const { writeConversationMode } = await import('../src/modes/mode.ts');
const { app, mock, bridge, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

describe('effectiveMode, flag off', () => {
	it('is manual even for a stored auto conversation', async () => {
		const id = await createConversation('off1');
		await writeConversationMode(app.db, id, USER_A, { mode: 'auto', anchorPageId: null });
		const user = { userId: USER_A, workspaceId: WORKSPACE_A, memberWorkspaces: [], isAdmin: false, issuedAtMs: Date.now(), expiresAtMs: Date.now() + 3_600_000 };
		const snap = await effectiveMode(app.db, { user, conversationId: id, runKind: 'request', credential: makeRunCredential('t', user.expiresAtMs) });
		assert.equal(snap.mode, 'manual');
	});
});

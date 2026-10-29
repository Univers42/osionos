import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { SseStream, collect } from './sse.ts';

/**
 * User skills and rules when the deployment has not turned them on (C1000,
 * C1010): the routes do not exist, and a run with rows in the table sends the
 * prompt of today, byte for byte. Anything but the exact word `on` is off.
 */
const { startHarness, USER_A, WORKSPACE_A } = await (async () => {
	process.env.OSIONOS_AI_USER_CONTEXT = 'ON';
	return import('./harness.ts');
})();
const { app, mock, call, tokenFor, createConversation, postRun } = await startHarness();
const { SYSTEM_PROMPT } = await import('../src/runs/prompt.ts');

after(async () => {
	await app.close();
	await mock.close();
});

function lastMessages(): { role?: string; content?: unknown }[] {
	return (mock.lastBody() as { messages?: { role?: string; content?: unknown }[] }).messages ?? [];
}
function textOf(content: unknown): string {
	if (typeof content === 'string') return content;
	return Array.isArray(content) ? content.map((part) => (part as { text?: string }).text ?? '').join('') : '';
}

describe('C1000 user context is off unless the flag is exactly on', () => {
	it('C1010 the routes are 404', async () => {
		const token = tokenFor(USER_A, WORKSPACE_A);
		assert.equal((await call('/api/ai/context/items', { token })).status, 404);
		assert.equal((await call('/api/ai/context/items', { method: 'POST', token, body: {} })).status, 404);
		assert.equal((await call(`/api/ai/workspaces/${WORKSPACE_A}/rules`, { token })).status, 404);
	});

	it('C1000 rows in the table change nothing in the run', async () => {
		// The suite shares one database: the flag-on file may have left rows.
		await app.db.query('delete from public.ai_context_items');
		await app.db.query(
			`insert into public.ai_context_items (kind, scope, owner_id, slug, name, description, body, created_by, updated_by)
			 values ('rule', 'user', $1, 'tone', 'n', 'd', 'OFF RULE', $1, $1), ('skill', 'user', $1, 'notes', 'n', 'd', 'b', $1, $1)`,
			[USER_A],
		);
		mock.setOptions({ preDelayMs: 0, chunkCount: 2, chunkGapMs: 0, fail: false });
		const conversationId = await createConversation();
		await collect(new SseStream(await postRun(conversationId, randomUUID(), 'hello')));
		const messages = lastMessages();
		assert.equal(textOf(messages.find((m) => m.role === 'system')?.content), SYSTEM_PROMPT);
		assert.equal(textOf(messages.filter((m) => m.role === 'user').at(-1)?.content), 'hello');
		assert.ok(!JSON.stringify(mock.lastBody()).includes('load_skill'), 'no load_skill tool');
	});
});

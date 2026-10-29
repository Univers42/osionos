import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { startHarness, USER_A, USER_B, WORKSPACE_A, WORKSPACE_B } from './harness.ts';
import { SseStream, collect } from './sse.ts';

/**
 * Bots in a conversation, service half: a stored answer names the agent that
 * gave it, and any agent may suggest a hand-off to a built-in one.
 */
const { app, mock, base, tokenFor, call, createConversation } = await startHarness();

// The service reads its configuration at import: these come after the harness.
const { keepAgentTools } = await import('../src/runs/toolSet.ts');
const { findBuiltinAgent } = await import('../src/agents/builtins.ts');
const { suggestAgent } = await import('../src/tools/viewTools.ts');
const { TOOL_DEFINITION_CHARS } = await import('../src/tools/index.ts');
const { listMessages } = await import('../src/conversations/repo.ts');

after(async () => {
	await app.close();
	await mock.close();
});

/** A conversation of USER_A holding a user row and an assistant row of a run. */
async function answered(pin: { agentId?: string; customId?: string }): Promise<{ conversationId: string; messages: Record<string, unknown>[] }> {
	const conversationId = await createConversation();
	const runId = randomUUID();
	await app.db.query(
		`insert into public.ai_runs (id, conversation_id, owner_id, status, model, agent_id, agent_version, custom_agent_id, custom_agent_version)
		 values ($1, $2, $3, 'succeeded', 'm', $4, $5, $6, $7)`,
		[runId, conversationId, USER_A, pin.agentId ?? null, pin.agentId ? 1 : null, pin.customId ?? null, pin.customId ? 1 : null],
	);
	for (const role of ['user', 'assistant']) {
		await app.db.query(
			`insert into public.ai_messages (conversation_id, run_id, role, parts) values ($1, $2, $3, '[]'::jsonb)`,
			[conversationId, runId, role],
		);
	}
	const answer = await call(`/api/ai/conversations/${conversationId}/messages`, { token: tokenFor(USER_A, WORKSPACE_A) });
	assert.equal(answer.status, 200);
	return { conversationId, messages: (answer.body as unknown as { messages: Record<string, unknown>[] }).messages };
}

const agentOf = (messages: Record<string, unknown>[], role: string) => messages.find((message) => message.role === role)?.agent_id;

describe('the stored answer names its agent', () => {
	it('a built-in agent answer carries its id, the user row null', async () => {
		const { messages } = await answered({ agentId: 'analyst' });
		assert.equal(agentOf(messages, 'assistant'), 'analyst');
		assert.equal(agentOf(messages, 'user'), null);
	});

	it('a custom agent answer carries the custom id, even when the agent is gone', async () => {
		const customId = randomUUID();
		const { messages } = await answered({ customId });
		assert.equal(agentOf(messages, 'assistant'), customId);
	});

	it('a general-assistant answer carries null', async () => {
		const { messages } = await answered({});
		assert.equal(agentOf(messages, 'assistant'), null);
		assert.equal(agentOf(messages, 'user'), null);
	});

	it('another user reads nothing of the conversation', async () => {
		const { conversationId } = await answered({ agentId: 'guide' });
		assert.deepEqual(await listMessages(app.db, { conversationId, ownerId: USER_B }), []);
		const answer = await call(`/api/ai/conversations/${conversationId}/messages`, { token: tokenFor(USER_B, WORKSPACE_B) });
		assert.equal(answer.status, 404);
	});
});

describe('suggest_agent', () => {
	const caller = (agentId: string | null) => ({
		db: app.db,
		user: { userId: USER_A, workspaceId: WORKSPACE_A, memberWorkspaces: [], isAdmin: false, issuedAtMs: Date.now() },
		agentId,
	});

	it('suggests a built-in agent and changes nothing', async () => {
		const result = await suggestAgent.run(caller(null), { agentId: 'analyst', reason: ' Numbers need it. ' });
		assert.equal(result.ok, true);
		if (result.ok) assert.deepEqual(suggestAgent.view(result.data), { action: 'suggest_agent', agentId: 'analyst', reason: 'Numbers need it.' });
	});

	it('refuses an unknown or custom id', async () => {
		for (const agentId of ['nope', randomUUID(), '', 7, undefined]) {
			const result = await suggestAgent.run(caller(null), { agentId, reason: 'why' });
			assert.equal(result.ok, false, String(agentId));
		}
	});

	it('refuses the agent that is already answering', async () => {
		assert.deepEqual(await suggestAgent.run(caller('guide'), { agentId: 'guide', reason: 'why' }), {
			ok: false,
			error: 'You are already that agent.',
		});
		assert.equal((await suggestAgent.run(caller('guide'), { agentId: 'analyst', reason: 'why' })).ok, true);
	});

	it('cleans control and format characters, and refuses a reason that is too long or empty', async () => {
		const dirty = await suggestAgent.run(caller(null), { agentId: 'guide', reason: 'a\u0000b‮c​d\n' });
		assert.equal(dirty.ok && dirty.data.reason, 'abcd');
		assert.equal((await suggestAgent.run(caller(null), { agentId: 'guide', reason: 'x'.repeat(201) })).ok, false);
		assert.equal((await suggestAgent.run(caller(null), { agentId: 'guide', reason: ' ​ ' })).ok, false);
		const edge = await suggestAgent.run(caller(null), { agentId: 'guide', reason: 'x'.repeat(200) });
		assert.equal(edge.ok, true);
	});

	it('is counted in the definition reservation', async () => {
		const { asSchema } = await import('ai');
		const own = JSON.stringify({
			type: 'function',
			function: { name: suggestAgent.name, description: suggestAgent.description, parameters: asSchema(suggestAgent.input).jsonSchema },
		}).length;
		const { VIEW_TOOLS } = await import('../src/tools/viewTools.ts');
		assert.ok(VIEW_TOOLS.includes(suggestAgent));
		assert.ok(TOOL_DEFINITION_CHARS > own, 'the reservation holds at least this one definition');
	});

	it('every agent keeps it', () => {
		const tools = { suggest_agent: {}, other: {} } as never;
		for (const id of ['analyst', 'db-architect', 'doc-writer', 'guide'] as const) {
			assert.deepEqual(Object.keys(keepAgentTools(tools, findBuiltinAgent(id))), ['suggest_agent']);
		}
	});
});

describe('a run that suggests', () => {
	before(() => {
		mock.setOptions({ preDelayMs: 0, chunkCount: 2, chunkGapMs: 0, fail: false, usage: null });
	});

	/** A run whose model calls suggest_agent; the tool.result events of it. */
	async function suggestingRun(agentId: string | undefined, target: string) {
		mock.setOptions({
			toolCall: { name: 'suggest_agent', arguments: { agentId: target, reason: 'It reads tables.' } },
			toolCallTrigger: 'hand off',
			toolCallEveryStep: false,
		});
		const conversationId = await createConversation();
		const response = await fetch(`${base}/api/ai/runs`, {
			method: 'POST',
			headers: { authorization: `Bearer ${tokenFor(USER_A, WORKSPACE_A)}`, 'content-type': 'application/json' },
			body: JSON.stringify({ runId: randomUUID(), conversationId, text: 'hand off', ...(agentId ? { agentId } : {}) }),
		});
		const events = await collect(new SseStream(response));
		return events.filter((event) => event.event === 'tool.result').map((event) => event.data as Record<string, unknown>);
	}

	it('the view reaches the run events, for the general assistant and for an agent', async () => {
		for (const agentId of [undefined, 'guide']) {
			const results = await suggestingRun(agentId, 'analyst');
			const hit = results.find((result) => result.toolName === 'suggest_agent');
			assert.ok(hit, `${agentId}: the tool ran`);
			assert.equal(hit.ok, true);
			assert.deepEqual(hit.view, { action: 'suggest_agent', agentId: 'analyst', reason: 'It reads tables.' });
		}
	});

	it('the run of an agent refuses its own id', async () => {
		const results = await suggestingRun('analyst', 'analyst');
		const hit = results.find((result) => result.toolName === 'suggest_agent');
		assert.equal(hit?.ok, false);
		assert.equal(hit?.error, 'You are already that agent.');
	});
});

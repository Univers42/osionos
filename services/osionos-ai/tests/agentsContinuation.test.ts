import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, describe, it, mock } from 'node:test';
import type { Pool } from 'pg';
import { WORKSPACE_A } from './harness.ts';
import { startAgents } from './agentsHarness.ts';
import type { Actor } from './agentsHarness.ts';
import { SseStream, collect } from './sse.ts';

/**
 * The continuation of an approval is a run of the agent version the first run
 * pinned, under the same gate as a new run (C301-C304, C333, C334, C336).
 */
const t = await startAgents();
const { app, mock: upstream, actor, setRole, as, make, settings, call } = t;
const { resolvePinnedAgent } = await import('../src/agents/resolve.ts');
const memberUser = (id: string) => ({ userId: id, workspaceId: '', memberWorkspaces: [], isAdmin: false, issuedAtMs: 0 });

before(() => settings(WORKSPACE_A, { agents_enabled: true, custom_agents_allowed: true }));

interface Asked {
	approvalId: string;
	conversationId: string;
	runId: string;
	card: Record<string, unknown> | null;
}

/** A run of the agent in which the model asks for create_page. */
async function ask(who: Actor, agentId: string): Promise<Asked> {
	upstream.setOptions({
		preDelayMs: 0,
		chunkCount: 2,
		chunkGapMs: 0,
		fail: false,
		toolCall: { name: 'create_page', arguments: { title: 'From agent', workspaceId: WORKSPACE_A } },
		toolCallTrigger: 'do it',
		toolCallEveryStep: false,
		parallelToolCalls: 1,
		usage: null,
	});
	const conversationId = await t.conversationOf(who);
	const runId = randomUUID();
	const events = await collect(new SseStream(await t.runWith(who, agentId, { text: 'do it', runId, conversationId })));
	const asked = events.filter((event) => event.event === 'permission.asked');
	assert.equal(asked.length, 1, 'the run asked once');
	const data = asked[0].data as { approvalId: string; agent?: Record<string, unknown> | null };
	return { approvalId: data.approvalId, conversationId, runId, card: data.agent ?? null };
}

const decide = (who: Actor, approvalId: string) =>
	call(`/api/ai/approvals/${approvalId}`, { method: 'POST', token: who.token, body: { decision: 'approve' } });

/** Decides, waits for the continuation to end, and returns its row (or null). */
async function approve(who: Actor, asked: Asked) {
	const answer = await decide(who, asked.approvalId);
	assert.equal(answer.status, 200);
	const id = (answer.body as { continuationRunId: string | null }).continuationRunId;
	const runs = await app.db.query('select id from public.ai_runs where conversation_id = $1', [asked.conversationId]);
	if (!id) return { continuation: null, runCount: runs.rowCount };
	for (let wait = 0; wait < 100; wait += 1) {
		const { rows } = await app.db.query(
			'select status, custom_agent_id, custom_agent_version, agent_id from public.ai_runs where id = $1',
			[id],
		);
		if (rows[0] && rows[0].status !== 'running') return { continuation: rows[0], runCount: runs.rowCount };
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error('the continuation did not end');
}

const systemOf = (): string =>
	(upstream.lastBody() as { messages: { role: string; content: string }[] }).messages.find((m) => m.role === 'system')?.content ?? '';

const WRITER = { tools: ['create_page'] };

describe('the version a continuation runs (C301, C302, C303, C304)', () => {
	it('C303 an agent edited between the card and the click runs the old version', async () => {
		const who = await actor();
		const made = await make(who, { ...WRITER, instructions: 'OLD-TEXT-31' });
		const asked = await ask(who, String(made.id));
		const patched = await as(who, 'PATCH', `/api/ai/agents/${made.id}`, { expectedVersion: 1, instructions: 'NEW-TEXT-32' });
		assert.equal(patched.status, 200);
		const { continuation } = await approve(who, asked);
		assert.equal(continuation?.custom_agent_version, 1, 'the pin, not the current row');
		assert.ok(systemOf().includes('OLD-TEXT-31') && !systemOf().includes('NEW-TEXT-32'));
	});

	it('C301 the continuation pins the same id and version, and no built-in pair', async () => {
		const who = await actor();
		const made = await make(who, WRITER);
		const { continuation } = await approve(who, await ask(who, String(made.id)));
		assert.deepEqual(
			[continuation?.custom_agent_id, continuation?.custom_agent_version, continuation?.agent_id],
			[made.id, 1, null],
		);
	});

	it('C302 an archived agent still continues, with the pinned text', async () => {
		const who = await actor();
		const made = await make(who, { ...WRITER, instructions: 'PINNED-TEXT-41' });
		const asked = await ask(who, String(made.id));
		assert.equal((await as(who, 'DELETE', `/api/ai/agents/${made.id}`)).status, 204);
		const { continuation } = await approve(who, asked);
		assert.equal(continuation?.status, 'succeeded');
		assert.ok(systemOf().includes('PINNED-TEXT-41'));
	});

	it('C304 the card names the agent and version from the pin, not from the current row', async () => {
		const who = await actor();
		const made = await make(who, { ...WRITER, name: 'First name' });
		const asked = await ask(who, String(made.id));
		assert.deepEqual(asked.card, { kind: 'custom', id: made.id, name: 'First name', version: 1, scope: 'user' });
		await as(who, 'PATCH', `/api/ai/agents/${made.id}`, { expectedVersion: 1, name: 'Second name' });
		const read = await call(`/api/ai/approvals/${asked.approvalId}`, { token: who.token });
		assert.deepEqual(read.body?.agent, asked.card);
	});

	it('C304 a run with no agent has a null card agent', async () => {
		const who = await actor();
		const asked = await ask(who, '');
		assert.equal(asked.card, null);
	});
});

describe('a continuation is refused by the one gate (C334, C336)', () => {
	/** The decision is made, the write may happen, and no continuation run exists. */
	async function refused(who: Actor, asked: Asked) {
		const warn = mock.method(console, 'warn', () => undefined);
		const { continuation, runCount } = await approve(who, asked);
		const lines = warn.mock.calls.map((call) => String(call.arguments[0]));
		warn.mock.restore();
		assert.equal(continuation, null, 'the response does not report a continuation');
		assert.equal(runCount, 1, 'no run row was created');
		return lines.find((line) => line.includes('continuation_agent_refused')) ?? '';
	}

	it('C334 agents_enabled=false', async () => {
		const who = await actor();
		const asked = await ask(who, String((await make(who, WRITER)).id));
		await settings(WORKSPACE_A, { agents_enabled: false, custom_agents_allowed: true });
		const log = await refused(who, asked);
		await settings(WORKSPACE_A, { agents_enabled: true, custom_agents_allowed: true });
		assert.ok(log.includes('agents_disabled') && log.includes(asked.approvalId));
	});

	it('C334 custom_agents_allowed=false with a non-admin', async () => {
		const who = await actor();
		const asked = await ask(who, String((await make(who, WRITER)).id));
		await settings(WORKSPACE_A, { agents_enabled: true, custom_agents_allowed: false });
		const log = await refused(who, asked);
		await settings(WORKSPACE_A, { agents_enabled: true, custom_agents_allowed: true });
		assert.ok(log.includes('custom_agents_not_allowed'));
	});

	it('C334 a demoted author', async () => {
		const author = await actor('owner');
		const member = await actor('member');
		const made = await make(author, { ...WRITER, scope: 'workspace', workspaceId: WORKSPACE_A });
		const asked = await ask(member, String(made.id));
		await setRole(author, 'member');
		assert.ok((await refused(member, asked)).includes('agent_needs_review'));
	});

	it('C334 a viewer', async () => {
		const author = await actor('owner');
		const member = await actor('member');
		const made = await make(author, { ...WRITER, scope: 'workspace', workspaceId: WORKSPACE_A });
		const asked = await ask(member, String(made.id));
		await setRole(member, 'viewer');
		assert.ok((await refused(member, asked)).includes('forbidden'));
	});

	it('C336 the log line carries run id, approval id and reason, and never the instructions', async () => {
		const who = await actor();
		const asked = await ask(who, String((await make(who, { ...WRITER, instructions: 'LOGMARK-336' })).id));
		await settings(WORKSPACE_A, { agents_enabled: false, custom_agents_allowed: true });
		const log = await refused(who, asked);
		await settings(WORKSPACE_A, { agents_enabled: true, custom_agents_allowed: true });
		assert.deepEqual(Object.keys(JSON.parse(log)).sort(), ['approvalId', 'event', 'reason', 'runId']);
		assert.ok(!log.includes('LOGMARK-336'));
	});
});

describe('resolvePinnedAgent fails closed on every path (C333)', () => {
	const user = (id: string) => memberUser(id);
	const run = (fields: Record<string, unknown>) => ({ agent_id: null, custom_agent_id: null, custom_agent_version: null, ...fields }) as never;

	it('C333 getRun null', async () => {
		assert.deepEqual(await resolvePinnedAgent(app.db, user(randomUUID()), null, WORKSPACE_A), { ok: false, reason: 'run_missing' });
	});

	it('C333 a custom id with a NULL version', async () => {
		const who = await actor();
		const made = await make(who);
		const answer = await resolvePinnedAgent(app.db, user(who.id), run({ custom_agent_id: made.id }), WORKSPACE_A);
		assert.deepEqual(answer, { ok: false, reason: 'agent_version_missing' });
	});

	it('C333 a thrown database error', async () => {
		const broken = { query: async () => { throw new Error('connection reset'); } } as unknown as Pool;
		const warn = mock.method(console, 'warn', () => undefined);
		const answer = await resolvePinnedAgent(broken, user(randomUUID()), run({ custom_agent_id: randomUUID(), custom_agent_version: 1 }), WORKSPACE_A);
		warn.mock.restore();
		assert.deepEqual(answer, { ok: false, reason: 'agent_check_failed' });
	});

	it('C333 a missing audit row and an unparsable one', async () => {
		const who = await actor();
		const made = await make(who);
		const pinned = (version: number) => run({ custom_agent_id: made.id, custom_agent_version: version });
		assert.deepEqual(await resolvePinnedAgent(app.db, user(who.id), pinned(7), WORKSPACE_A), { ok: false, reason: 'agent_version_missing' });
		await app.db.query(
			`insert into public.ai_agents_audit (agent_id, version, action, actor_id, after) values ($1, 2, 'update', $2, '{"id": 1}'::jsonb)`,
			[made.id, who.id],
		);
		assert.deepEqual(await resolvePinnedAgent(app.db, user(who.id), pinned(2), WORKSPACE_A), { ok: false, reason: 'agent_version_missing' });
	});

	it('C333 an archived agent runs the pinned text', async () => {
		const who = await actor();
		const made = await make(who, { instructions: 'ARCHIVED-PIN' });
		await as(who, 'DELETE', `/api/ai/agents/${made.id}`);
		const answer = await resolvePinnedAgent(app.db, user(who.id), run({ custom_agent_id: made.id, custom_agent_version: 1 }), WORKSPACE_A);
		assert.ok(answer.ok && answer.agent?.instructions === 'ARCHIVED-PIN');
	});

	it('C333 a removed built-in is null only for a built-in-pinned run; a custom pin is never null', async () => {
		const who = await actor();
		assert.deepEqual(await resolvePinnedAgent(app.db, user(who.id), run({ agent_id: 'removed-builtin' }), WORKSPACE_A), { ok: true, agent: null });
		const answer = await resolvePinnedAgent(app.db, user(who.id), run({ custom_agent_id: randomUUID(), custom_agent_version: 1 }), WORKSPACE_A);
		assert.equal(answer.ok, false);
	});

	it('C333 a continuation whose pinned version is gone is refused and creates no run', async () => {
		const who = await actor();
		const asked = await ask(who, String((await make(who, WRITER)).id));
		await app.db.query('update public.ai_runs set custom_agent_version = 9 where id = $1', [asked.runId]);
		const warn = mock.method(console, 'warn', () => undefined);
		const { continuation, runCount } = await approve(who, asked);
		warn.mock.restore();
		assert.deepEqual([continuation, runCount], [null, 1]);
	});
});

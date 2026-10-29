import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, describe, it, mock } from 'node:test';
import { WORKSPACE_A, WORKSPACE_B } from './harness.ts';
import { startAgents } from './agentsHarness.ts';
import type { Actor } from './agentsHarness.ts';
import { SseStream, collect } from './sse.ts';

/**
 * A new run with a custom agent (D3 slice B1): the gate, the pin, the prompt
 * the model gets, and the tools it is offered.
 */
const t = await startAgents();
const { app, mock: upstream, actor, setRole, as, make, settings, runWith } = t;

before(() => settings(WORKSPACE_A, { agents_enabled: true, custom_agents_allowed: true }));

/** Runs the agent and reads the stream to its end; the answer carries the status. */
async function runOf(who: Actor, agentId: string, options: Parameters<typeof runWith>[2] = {}) {
	const response = await runWith(who, agentId, options);
	const body = response.headers.get('content-type')?.includes('json') ? ((await response.json()) as { code?: string }) : null;
	if (!body) await collect(new SseStream(response));
	return { status: response.status, code: body?.code };
}

const systemOf = (): string => {
	const body = upstream.lastBody() as { messages: { role: string; content: string }[] };
	return body.messages.find((message) => message.role === 'system')?.content ?? '';
};
const toolsOf = (): string[] =>
	((upstream.lastBody() as { tools?: { function: { name: string } }[] }).tools ?? []).map((tool) => tool.function.name);

/** An agent row written straight to the table, the way an old or hand-made row looks. */
async function insertAgent(fields: {
	scope?: 'user' | 'workspace';
	owner?: string;
	workspace?: string;
	author: string;
	instructions?: string;
	tools?: string[];
	skills?: string[];
}): Promise<string> {
	const id = randomUUID();
	const scope = fields.scope ?? 'user';
	await app.db.query(
		`insert into public.ai_agents (id, scope, owner_id, workspace_id, name, instructions, tools, skills, created_by, updated_by)
		 values ($1, $2, $3, $4, 'Direct', $5, $6, $7, $8, $8)`,
		[
			id,
			scope,
			scope === 'user' ? (fields.owner ?? fields.author) : null,
			scope === 'workspace' ? (fields.workspace ?? WORKSPACE_A) : null,
			fields.instructions ?? 'Direct text.',
			fields.tools ?? [],
			fields.skills ?? [],
			fields.author,
		],
	);
	await app.db.query(
		`insert into public.ai_agents_audit (agent_id, version, action, actor_id, after)
		 select id, version, 'create', created_by, to_jsonb(ai_agents) from public.ai_agents where id = $1`,
		[id],
	);
	return id;
}

describe('the gate of a new run (C297, C298, C299, C332, C334)', () => {
	it('C297 a workspace agent of another workspace is 409 agent_wrong_workspace; a caller with no member row is 403', async () => {
		const admin = await actor('owner');
		const elsewhere = await insertAgent({ scope: 'workspace', workspace: WORKSPACE_B, author: admin.id });
		assert.deepEqual(await runOf(admin, elsewhere), { status: 409, code: 'agent_wrong_workspace' });
		const here = (await make(admin, { scope: 'workspace', workspaceId: WORKSPACE_A })).id;
		const gone = await actor('member');
		await setRole(gone, 'none');
		assert.deepEqual(await runOf(gone, here), { status: 403, code: 'forbidden' });
	});

	it('C298 a viewer cannot run a workspace agent, a member can', async () => {
		const admin = await actor('owner');
		const id = (await make(admin, { scope: 'workspace', workspaceId: WORKSPACE_A })).id;
		assert.deepEqual(await runOf(await actor('viewer'), id), { status: 403, code: 'forbidden' });
		assert.equal((await runOf(await actor('member'), id)).status, 200);
	});

	it('C299 a workspace agent whose author is no longer an admin needs review until a live admin saves it again', async () => {
		const author = await actor('owner');
		const id = (await make(author, { scope: 'workspace', workspaceId: WORKSPACE_A })).id;
		const member = await actor('member');
		assert.equal((await runOf(member, id)).status, 200);
		await setRole(author, 'member');
		assert.deepEqual(await runOf(member, id), { status: 409, code: 'agent_needs_review' });
		const listed = (await as(member, 'GET', `/api/ai/agents/${id}`)).body;
		assert.equal(listed?.needsReview, true);
		const reviewer = await actor('owner');
		assert.equal((await as(reviewer, 'PATCH', `/api/ai/agents/${id}`, { expectedVersion: 1, name: 'Reviewed' })).status, 200);
		assert.equal((await runOf(member, id)).status, 200);
	});

	it('C299 an erased author (the tombstone) is never trusted', async () => {
		const id = await insertAgent({ scope: 'workspace', author: '00000000-0000-4000-8000-000000000000' });
		assert.deepEqual(await runOf(await actor('member'), id), { status: 409, code: 'agent_needs_review' });
	});

	it('C332 another user agent is 404, an archived one is 409 agent_archived, an unknown uuid is 404', async () => {
		const [owner, other] = [await actor(), await actor()];
		const id = (await make(owner)).id;
		assert.deepEqual(await runOf(other, id), { status: 404, code: 'not_found' });
		assert.deepEqual(await runOf(owner, randomUUID()), { status: 404, code: 'not_found' });
		await as(owner, 'DELETE', `/api/ai/agents/${id}`);
		assert.deepEqual(await runOf(owner, id), { status: 409, code: 'agent_archived' });
	});

	it('C334 agents_enabled=false refuses a new run; custom_agents_allowed=false refuses a non-admin user agent only', async () => {
		const [member, admin] = [await actor('member'), await actor('owner')];
		const mine = (await make(member)).id;
		const adminOwn = (await make(admin)).id;
		await settings(WORKSPACE_A, { agents_enabled: true, custom_agents_allowed: false });
		assert.deepEqual(await runOf(member, mine), { status: 403, code: 'custom_agents_not_allowed' });
		assert.equal((await runOf(admin, adminOwn)).status, 200, 'a live admin is not bound by the switch');
		await settings(WORKSPACE_A, { agents_enabled: false, custom_agents_allowed: true });
		assert.deepEqual(await runOf(member, mine), { status: 409, code: 'agents_disabled' });
		await settings(WORKSPACE_A, { agents_enabled: true, custom_agents_allowed: true });
		assert.equal((await runOf(member, mine)).status, 200);
	});
});

describe('the pin and the prompt (C301, C324, C325, C306, C307, C321)', () => {
	it('C301 the run row pins the custom id and version, and the built-in pair stays NULL', async () => {
		const who = await actor();
		const made = await make(who);
		await as(who, 'PATCH', `/api/ai/agents/${made.id}`, { expectedVersion: 1, name: 'Two' });
		const runId = randomUUID();
		await runOf(who, String(made.id), { runId });
		const { rows } = await app.db.query(
			'select custom_agent_id, custom_agent_version, agent_id, agent_version from public.ai_runs where id = $1',
			[runId],
		);
		assert.deepEqual(rows, [{ custom_agent_id: made.id, custom_agent_version: 2, agent_id: null, agent_version: null }]);
	});

	it('C324 a workspace agent renders the fixed banner; a user agent does not; the stored text never holds it', async () => {
		const admin = await actor('owner');
		const ws = await make(admin, { scope: 'workspace', workspaceId: WORKSPACE_A, instructions: 'WS-TEXT-1' });
		await runOf(admin, String(ws.id));
		const { WORKSPACE_AGENT_BANNER } = await import('../src/agents/prompt.ts');
		assert.ok(systemOf().includes(`${WORKSPACE_AGENT_BANNER}\n`) && systemOf().includes('WS-TEXT-1'));
		const own = await make(admin, { instructions: 'USER-TEXT-1' });
		await runOf(admin, String(own.id));
		assert.ok(systemOf().includes('USER-TEXT-1') && !systemOf().includes(WORKSPACE_AGENT_BANNER));
		const stored = await app.db.query('select instructions from public.ai_agents where id = $1', [ws.id]);
		assert.ok(!stored.rows[0].instructions.includes(WORKSPACE_AGENT_BANNER));
	});

	it('C325 the reservation counts the rendered prompt: a maximal agent reserves more than the default', async () => {
		const who = await actor();
		const big = (await make(who, { instructions: 'a'.repeat(1500), description: 'd'.repeat(200) })).id;
		const reserved = async (agentId?: string): Promise<number> => {
			const runId = randomUUID();
			await runWith(who, agentId, { runId, model: 'mock-metered' }).then((r) => collect(new SseStream(r)));
			const { rows } = await app.db.query('select reserved_microusd from public.ai_runs where id = $1', [runId]);
			return Number(rows[0].reserved_microusd);
		};
		const [plain, maximal] = [await reserved(), await reserved(String(big))];
		assert.ok(maximal > plain, `maximal ${maximal} > default ${plain}`);
	});

	it('C306 and C307 a tool the registry lost is dropped at use with a log; the run never offers an mcp_ tool', async () => {
		const warn = mock.method(console, 'warn', () => undefined);
		const who = await actor();
		const id = await insertAgent({ author: who.id, tools: ['read_page', 'ghost_tool'] });
		assert.equal((await runOf(who, id)).status, 200);
		const dropped = warn.mock.calls.map((call) => String(call.arguments[0])).filter((line) => line.includes('agent_tool_dropped'));
		warn.mock.restore();
		assert.equal(dropped.length > 0 && dropped[0].includes('ghost_tool'), true);
		assert.ok(toolsOf().includes('read_page') && !toolsOf().includes('ghost_tool'));
		assert.ok(toolsOf().every((name) => !name.startsWith('mcp_')), 'zero MCP tools');
	});

	it('C321 a skill the registry lost is dropped at use with a log event of ids; no error', async () => {
		const warn = mock.method(console, 'warn', () => undefined);
		const who = await actor();
		const id = await insertAgent({ author: who.id, skills: ['concise-docs', 'gone-skill'] });
		const answer = await runOf(who, id);
		const lines = warn.mock.calls.map((call) => String(call.arguments[0])).filter((line) => line.includes('agent_skill_dropped'));
		warn.mock.restore();
		assert.equal(answer.status, 200);
		assert.ok(lines.length > 0 && lines[0].includes('gone-skill'));
		assert.ok(systemOf().includes('concise-docs'));
	});
});

describe('a stored agent that no longer fits (C340)', () => {
	it('C340 the re-check marks the row failed agent_invalid before any reservation; a re-POST answers 409 agent_invalid', async () => {
		const who = await actor();
		const id = await insertAgent({ author: who.id, instructions: '&'.repeat(1500) });
		const runId = randomUUID();
		const conversationId = await t.conversationOf(who);
		const first = await runOf(who, id, { runId, conversationId, model: 'mock-metered' });
		assert.deepEqual(first, { status: 409, code: 'agent_invalid' });
		const row = await app.db.query('select status, error, reserved_microusd from public.ai_runs where id = $1', [runId]);
		assert.deepEqual(row.rows, [{ status: 'failed', error: 'agent_invalid', reserved_microusd: '0' }]);
		const again = await runOf(who, id, { runId, conversationId, model: 'mock-metered' });
		assert.deepEqual(again, { status: 409, code: 'agent_invalid' });
		const usage = await app.db.query(
			"select count(*)::int as n from public.ai_usage_daily where subject = $1 and (spent_microusd > 0 or reserved_microusd > 0)",
			[who.id],
		);
		assert.equal(usage.rows[0].n, 0, 'no ledger movement');
	});
});

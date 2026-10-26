import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it, mock } from 'node:test';
import { WORKSPACE_A, WORKSPACE_B } from './harness.ts';
import { startAgents } from './agentsHarness.ts';
import type { Actor } from './agentsHarness.ts';

/**
 * The routes of custom agents with OSIONOS_AI_CUSTOM_AGENTS on (D3 slice B1):
 * who writes, who reads, what is refused, and what is audited.
 */
const t = await startAgents();
const { app, as, make, actor, setRole, draft, settings } = t;

const NOBODY = '99999999-9999-4999-8999-999999999999';

describe('who writes a workspace agent (C296)', () => {
	it('C296 a live admin writes; a member, a viewer and a demoted admin get 403', async () => {
		const admin = await t.actor('owner');
		const wsDraft = draft({ scope: 'workspace', workspaceId: WORKSPACE_A });
		assert.equal((await as(admin, 'POST', '/api/ai/agents', wsDraft)).status, 201);
		for (const role of ['member', 'viewer'] as const) {
			assert.equal((await as(await actor(role), 'POST', '/api/ai/agents', wsDraft)).status, 403, role);
		}
		await setRole(admin, 'member');
		assert.equal((await as(admin, 'POST', '/api/ai/agents', wsDraft)).status, 403, 'demoted: the token still says owner');
	});

	it('C296 the token claim of a private workspace is not a member row', async () => {
		const stranger = await actor('member');
		await setRole(stranger, 'none');
		// The token names WORKSPACE_A as the user own workspace; the live row is gone.
		const answer = await as(stranger, 'POST', '/api/ai/agents', draft({ scope: 'workspace', workspaceId: WORKSPACE_A }));
		assert.equal(answer.status, 403);
	});
});

describe('who reads (C300 amended, C332)', () => {
	it('C300 the list shows names to a live reader and no instructions; GET one shows them to who may run', async () => {
		const admin = await actor('owner');
		const made = await make(admin, { scope: 'workspace', workspaceId: WORKSPACE_A, instructions: 'SECRET-WS-TEXT' });
		const viewer = await actor('viewer');
		const member = await actor('member');
		for (const who of [viewer, member, admin]) {
			const list = await as(who, 'GET', '/api/ai/agents');
			const raw = JSON.stringify(list.body);
			assert.ok(raw.includes(String(made.id)), 'a live reader sees the agent');
			assert.ok(!raw.includes('SECRET-WS-TEXT'), 'the list never carries instructions');
		}
		assert.equal((await as(member, 'GET', `/api/ai/agents/${made.id}`)).body?.instructions, 'SECRET-WS-TEXT');
		assert.equal((await as(viewer, 'GET', `/api/ai/agents/${made.id}`)).body?.instructions, undefined);
	});

	it('C300 a member reads no instructions of an agent nobody may run; an admin still does, to review it', async () => {
		const author = await actor('owner');
		const reviewer = await actor('owner');
		const member = await actor('member');
		const readAs = async (who: Actor, id: string) => (await as(who, 'GET', `/api/ai/agents/${id}`)).body?.instructions;

		const flagged = await make(author, { scope: 'workspace', workspaceId: WORKSPACE_A, instructions: 'SECRET-REVIEW-TEXT' });
		await setRole(author, 'member');
		assert.equal((await as(member, 'GET', `/api/ai/agents/${flagged.id}`)).body?.needsReview, true);
		assert.equal(await readAs(member, String(flagged.id)), undefined, 'needs review: a member reads none');
		assert.equal(await readAs(reviewer, String(flagged.id)), 'SECRET-REVIEW-TEXT', 'an admin reads them to review');

		const fine = await make(reviewer, { scope: 'workspace', workspaceId: WORKSPACE_A, instructions: 'SECRET-OFF-TEXT' });
		assert.equal(await readAs(member, String(fine.id)), 'SECRET-OFF-TEXT', 'runnable: a member reads them');
		await settings(WORKSPACE_A, { agents_enabled: false });
		try {
			assert.equal(await readAs(member, String(fine.id)), undefined, 'agents off: a member reads none');
			assert.equal(await readAs(reviewer, String(fine.id)), 'SECRET-OFF-TEXT');
		} finally {
			await settings(WORKSPACE_A, { agents_enabled: true, custom_agents_allowed: false });
		}
	});

	it('C300 a non-member gets 404, in the list and on GET one', async () => {
		const admin = await actor('owner');
		const made = await make(admin, { scope: 'workspace', workspaceId: WORKSPACE_A });
		const outsider = await actor('member');
		await setRole(outsider, 'none');
		assert.equal((await as(outsider, 'GET', `/api/ai/agents/${made.id}`)).status, 404);
		assert.ok(!JSON.stringify((await as(outsider, 'GET', '/api/ai/agents')).body).includes(String(made.id)));
	});

	it('C332 a user-scope agent of another user is 404 on GET, PATCH and DELETE', async () => {
		const [owner, other] = [await actor(), await actor()];
		const made = await make(owner);
		assert.equal((await as(owner, 'GET', `/api/ai/agents/${made.id}`)).status, 200);
		for (const method of ['GET', 'PATCH', 'DELETE']) {
			const body = method === 'PATCH' ? { expectedVersion: 1, name: 'x' } : undefined;
			assert.equal((await as(other, method, `/api/ai/agents/${made.id}`, body)).status, 404, method);
		}
		assert.ok(!JSON.stringify((await as(other, 'GET', '/api/ai/agents')).body).includes(String(made.id)));
	});
});

describe('the body (C332, C306, C307, C309)', () => {
	it('C332 and C309 model, connection_id, effort and knowledge are 422, on create and on patch', async () => {
		const who = await actor();
		const made = await make(who);
		for (const extra of [{ model: 'm' }, { connection_id: randomUUID() }, { effort: 'high' }, { knowledge: ['x'] }]) {
			assert.equal((await as(who, 'POST', '/api/ai/agents', draft(extra))).status, 422, JSON.stringify(extra));
			const patch = await as(who, 'PATCH', `/api/ai/agents/${made.id}`, { expectedVersion: 1, ...extra });
			assert.equal(patch.status, 422, JSON.stringify(extra));
		}
	});

	it('C306 and C307 an unknown tool and an mcp_ tool are 422 at write; a registry tool is stored', async () => {
		const who = await actor();
		for (const tools of [['no_such_tool'], ['mcp_server_tool']]) {
			const answer = await as(who, 'POST', '/api/ai/agents', draft({ tools }));
			assert.equal(answer.status, 422);
			assert.equal(answer.body?.code, 'unknown_tool');
		}
		const ok = await as(who, 'POST', '/api/ai/agents', draft({ tools: ['read_page', 'read_page'] }));
		assert.equal(ok.status, 201);
		assert.deepEqual(ok.body?.tools, ['read_page'], 'repeats are dropped');
	});

	it('C321 a skill that is not a built-in is 422 at write', async () => {
		const answer = await as(await actor(), 'POST', '/api/ai/agents', draft({ skills: ['no-such-skill'] }));
		assert.equal(answer.status, 422);
		assert.equal(answer.body?.code, 'invalid_skills');
	});

	it('C293 C332 instructions that render over the prefix cap are 422 prefix_too_large', async () => {
		const answer = await as(await actor(), 'POST', '/api/ai/agents', draft({ instructions: '&'.repeat(1500) }));
		assert.equal(answer.status, 422);
		assert.equal(answer.body?.code, 'prefix_too_large');
	});
});

describe('versions, audit and caps (C304, C318, C322, C313)', () => {
	it('C304 PATCH needs expectedVersion: a stale one is 409 version_conflict, a good one bumps the version', async () => {
		const who = await actor();
		const made = await make(who);
		assert.equal((await as(who, 'PATCH', `/api/ai/agents/${made.id}`, { name: 'x' })).status, 422, 'expectedVersion is required');
		const good = await as(who, 'PATCH', `/api/ai/agents/${made.id}`, { expectedVersion: 1, name: 'Second' });
		assert.equal(good.status, 200);
		assert.equal(good.body?.version, 2);
		const stale = await as(who, 'PATCH', `/api/ai/agents/${made.id}`, { expectedVersion: 1, name: 'Third' });
		assert.equal(stale.status, 409);
		assert.equal(stale.body?.code, 'version_conflict');
	});

	it('C322 and C313 create, update and archive each write an audit row with the whole row in after', async () => {
		const who = await actor();
		const made = await make(who, { instructions: 'first text' });
		await as(who, 'PATCH', `/api/ai/agents/${made.id}`, { expectedVersion: 1, instructions: 'second text' });
		assert.equal((await as(who, 'DELETE', `/api/ai/agents/${made.id}`)).status, 204);
		const { rows } = await app.db.query(
			'select version, action, actor_id, before, after from public.ai_agents_audit where agent_id = $1 order by id',
			[made.id],
		);
		assert.deepEqual(rows.map((row) => [row.version, row.action, row.actor_id]), [
			[1, 'create', who.id],
			[2, 'update', who.id],
			[3, 'archive', who.id],
		]);
		assert.equal(rows[0].after.instructions, 'first text');
		assert.equal(rows[1].before.instructions, 'first text');
		assert.equal(rows[1].after.instructions, 'second text');
		assert.equal(rows[1].after.version, 2, 'the whole row, version included');
	});

	it('C332 PATCH and DELETE on an archived agent are 409 agent_archived', async () => {
		const who = await actor();
		const made = await make(who);
		await as(who, 'DELETE', `/api/ai/agents/${made.id}`);
		const patch = await as(who, 'PATCH', `/api/ai/agents/${made.id}`, { expectedVersion: 2, name: 'x' });
		assert.deepEqual([patch.status, patch.body?.code], [409, 'agent_archived']);
		assert.equal((await as(who, 'DELETE', `/api/ai/agents/${made.id}`)).status, 409);
		const listed = (await as(who, 'GET', '/api/ai/agents')).body as unknown as { id: string }[];
		assert.ok(!listed.some((agent) => agent.id === made.id), 'an archived agent is not listed');
	});

	it('C318 the cap is 20 user agents per user and 8 per workspace, enforced under the lock', async () => {
		const who = await actor();
		await app.db.query(
			`insert into public.ai_agents (scope, owner_id, name, instructions, created_by, updated_by)
			 select 'user', $1::uuid, 'a' || n, 'i', $1::uuid, $1::uuid from generate_series(1, 20) n`,
			[who.id],
		);
		const full = await as(who, 'POST', '/api/ai/agents', draft());
		assert.deepEqual([full.status, full.body?.code], [409, 'agent_limit']);
		const ws = randomUUID();
		const admin = await actor('owner');
		await app.db.query(
			`insert into public.ai_agents (scope, workspace_id, name, instructions, created_by, updated_by)
			 select 'workspace', $1::uuid, 'w' || n, 'i', $2::uuid, $2::uuid from generate_series(1, 8) n`,
			[ws, admin.id],
		);
		await app.db.query(
			'insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions) values ($1, $2, $3, $4)',
			[ws, admin.id, 'owner', []],
		);
		const wsFull = await as(admin, 'POST', '/api/ai/agents', draft({ scope: 'workspace', workspaceId: ws }));
		assert.deepEqual([wsFull.status, wsFull.body?.code], [409, 'agent_limit']);
		// Race: two creates at 19 agents leave exactly 20.
		const racer = await actor();
		await app.db.query(
			`insert into public.ai_agents (scope, owner_id, name, instructions, created_by, updated_by)
			 select 'user', $1::uuid, 'a' || n, 'i', $1::uuid, $1::uuid from generate_series(1, 19) n`,
			[racer.id],
		);
		const raced = await Promise.all([1, 2].map(() => as(racer, 'POST', '/api/ai/agents', draft())));
		assert.deepEqual(raced.map((r) => r.status).sort(), [201, 409]);
	});

	it('C319 the 21st write of a minute is 429 with retry-after', async () => {
		const who = await actor();
		const made = await make(who);
		let last = 0;
		for (let version = 1; version <= 20 && last !== 429; version += 1) {
			last = (await as(who, 'PATCH', `/api/ai/agents/${made.id}`, { expectedVersion: version, name: 'n' })).status;
		}
		assert.equal(last, 429, 'the create plus nineteen patches used the window, the next is refused');
	});
});

describe('the workspace switches (C305)', () => {
	const path = (ws: string) => `/api/ai/workspaces/${ws}/agents/settings`;

	it('C305 a live admin writes them, a member reads them but cannot write; the defaults are enabled / not allowed', async () => {
		const ws = randomUUID();
		const [admin, member] = [await actor('owner'), await actor('member')];
		for (const who of [admin, member]) {
			await app.db.query(
				'insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions) values ($1, $2, $3, $4)',
				[ws, who.id, who === admin ? 'owner' : 'member', who === admin ? [] : ['read', 'create']],
			);
		}
		assert.deepEqual((await as(member, 'GET', path(ws))).body, { agents_enabled: true, custom_agents_allowed: false });
		const body = { agents_enabled: false, custom_agents_allowed: true };
		assert.equal((await as(member, 'PUT', path(ws), body)).status, 403, 'a flipped client flag changes nothing');
		assert.equal((await as(admin, 'PUT', path(ws), body)).status, 200);
		assert.deepEqual((await as(member, 'GET', path(ws))).body, body);
		assert.equal((await as(admin, 'PUT', path(ws), { agents_enabled: true })).status, 400, 'both switches, always');
		const outsider = await actor();
		assert.equal((await as(outsider, 'GET', path(WORKSPACE_B))).status, 404, 'a workspace the caller is not in');
	});
});

describe('the flag is on (C329)', () => {
	it('C329 with the flag on the routes exist and the list is the built-ins then the custom agents', async () => {
		const who = await actor();
		const made = await make(who, { name: 'Mine' });
		const list = (await as(who, 'GET', '/api/ai/agents')).body as unknown as { id: string; kind?: string }[];
		const index = list.findIndex((agent) => agent.id === made.id);
		assert.ok(index > 0, 'after the built-ins');
		assert.ok(list.slice(0, index).every((agent) => agent.kind !== 'custom'));
		assert.equal((await as(who, 'GET', `/api/ai/agents/${NOBODY}`)).status, 404);
	});
});

describe('logs (C323)', () => {
	it('C323 no log line carries the instructions of an agent', async () => {
		const lines: string[] = [];
		const spies = (['log', 'warn', 'info', 'error'] as const).map((level) =>
			mock.method(console, level, (...args: unknown[]) => void lines.push(args.map(String).join(' '))),
		);
		const who = await actor();
		const made = await make(who, { instructions: 'LOGMARK-7f3a', skills: [], tools: ['bogus_dropped'].slice(1) });
		await as(who, 'PATCH', `/api/ai/agents/${made.id}`, { expectedVersion: 1, instructions: 'LOGMARK-7f3a v2' });
		await t.runWith(who, String(made.id));
		for (const spy of spies) spy.mock.restore();
		assert.ok(lines.some((line) => line.includes('agent_written')), 'the write itself is logged, by ids and lengths');
		assert.ok(!lines.some((line) => line.includes('LOGMARK-7f3a')), 'the instructions stay out of the logs');
	});
});

/**
 * Run-start provenance (AM3 part 1): what the model is handed at the start of a
 * run marks the conversation tainted BEFORE the first model request, the first
 * reason sticks, and a clean run leaves the conversation untainted.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';
import { SseStream, collect } from './sse.ts';
import type { AuthUser } from '../src/auth.ts';

// The modes flag on, and only USER_A allowlisted: the full check runs for A, a legacy mark for B.
process.env.OSIONOS_AI_MODES = 'on';
process.env.OSIONOS_AI_MODES_USERS = '11111111-1111-4111-8111-111111111111';
const { startHarness, USER_A, USER_B, WORKSPACE_A } = await import('./harness.ts');
const { app, mock, bridge, postRun, tokenFor, createConversation } = await startHarness();
const { conversationTaint, markProvenanceTaint } = await import('../src/provenance/repo.ts');
const { markRunStartProvenance, markRunStart } = await import('../src/provenance/runStart.ts');
type Inputs = Parameters<typeof markRunStartProvenance>[1];

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const user: AuthUser = { userId: USER_A, workspaceId: WORKSPACE_A, memberWorkspaces: [], isAdmin: false, issuedAtMs: Date.now(), expiresAtMs: null };

async function page(visibility: string, ownerId = USER_A): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, content) values ($1, $2, $3, 't', $4, '[]'::jsonb)`,
		[id, WORKSPACE_A, ownerId, visibility],
	);
	return id;
}

async function reasonOf(conversationId: string): Promise<string | null> {
	const row = await app.db.query('select provenance_reason from public.ai_conversations where id = $1', [conversationId]);
	return row.rows[0].provenance_reason;
}

function inputs(conversationId: string, over: Partial<Inputs> = {}): Inputs {
	return {
		conversationId, user, contextPageIds: [], sourcePageIds: [], overviewPageIds: [], viewTabs: [],
		attachmentCount: 0, imageCount: 0, skillIndex: [], customAgent: null, thread: false, ...over,
	};
}

describe('run-start provenance', () => {
	beforeEach(async () => {
		await app.db.query('delete from public.osionos_workspace_members where workspace_id = $1', [WORKSPACE_A]);
		await app.db.query('delete from public.osionos_share_rules where workspace_id = $1', [WORKSPACE_A]);
		await app.db.query('delete from public.osionos_pages where workspace_id = $1', [WORKSPACE_A]);
		await app.db.query('delete from public.ai_skills where workspace_id = $1', [WORKSPACE_A]);
	});

	async function run(over: Partial<Inputs>): Promise<{ reason: string | null; stored: string | null }> {
		const conversationId = await createConversation();
		const reason = await markRunStartProvenance(app.db, inputs(conversationId, over));
		return { reason, stored: await reasonOf(conversationId) };
	}

	const cases: [string, Partial<Inputs>, string][] = [
		['an attachment', { attachmentCount: 1 }, 'attachment'],
		['an image', { imageCount: 1 }, 'image'],
		['a thread run', { thread: true }, 'thread'],
		['a page tab with no id', { viewTabs: [{ title: 'x', kind: 'page' }] }, 'unknown_view'],
		['a database tab with no id', { viewTabs: [{ title: 'x', kind: 'database' }] }, 'unknown_view'],
	];
	for (const [name, over, expected] of cases) {
		it(`${name} taints as ${expected}`, async () => {
			assert.deepEqual(await run(over), { reason: expected, stored: expected });
		});
	}

	it('an app tab, a page tab with an id, and a clean run leave it untainted', async () => {
		const own = await page('private');
		const tabs = [{ title: 'a', kind: 'app' as const }, { title: 'p', kind: 'page' as const, pageId: own }];
		assert.deepEqual(await run({ viewTabs: tabs, contextPageIds: [own], sourcePageIds: [own], overviewPageIds: [own] }), { reason: null, stored: null });
	});

	it('a shared page in context or sources is shared_page', async () => {
		const shared = await page('shared');
		assert.equal((await run({ contextPageIds: [shared] })).stored, 'shared_page');
		assert.equal((await run({ sourcePageIds: [shared] })).stored, 'shared_page');
	});

	it('a shared title in the overview is shared_title', async () => {
		const shared = await page('shared', USER_B);
		assert.deepEqual(await run({ overviewPageIds: [shared] }), { reason: 'shared_title', stored: 'shared_title' });
	});

	it('a workspace skill written by someone else is foreign_skill; the user own one is not', async () => {
		const skill = async (createdBy: string, updatedBy: string, slug: string) => (await app.db.query(
			`insert into public.ai_skills (workspace_id, slug, name, description, body, created_by, updated_by)
			 values ($1, $2, 'n', 'd', 'b', $3, $4) returning id`, [WORKSPACE_A, slug, createdBy, updatedBy])).rows[0].id as string;
		const entry = (skillId: string) => ({ id: 's', version: 1, source: 'workspace' as const, description: 'd', skillId });
		const builtin = { id: 'b', version: 1, source: 'builtin' as const, description: 'd' };
		assert.equal((await run({ skillIndex: [builtin, entry(await skill(USER_A, USER_A, 'mine'))] })).stored, null);
		assert.equal((await run({ skillIndex: [entry(await skill(USER_A, USER_B, 'edited'))] })).stored, 'foreign_skill');
		assert.equal((await run({ skillIndex: [entry(await skill(USER_B, USER_B, 'theirs'))] })).stored, 'foreign_skill');
	});

	it('a custom agent is trusted when user-owned or written only by the user, else foreign_agent', async () => {
		const agent = (over: object) => ({ scope: 'user' as const, ownerId: USER_A, createdBy: USER_A, updatedBy: USER_A, ...over });
		assert.equal((await run({ customAgent: agent({}) })).stored, null);
		assert.equal((await run({ customAgent: agent({ createdBy: USER_B }) })).stored, null);
		assert.equal((await run({ customAgent: agent({ scope: 'workspace', ownerId: null }) })).stored, null);
		assert.equal((await run({ customAgent: agent({ scope: 'workspace', ownerId: null, updatedBy: USER_B }) })).stored, 'foreign_agent');
		assert.equal((await run({ customAgent: agent({ ownerId: USER_B, createdBy: USER_B }) })).stored, 'foreign_agent');
	});

	it('the first reason sticks, in the repo and in a run with two causes', async () => {
		const conversationId = await createConversation();
		await markProvenanceTaint(app.db, conversationId, 'image');
		await markProvenanceTaint(app.db, conversationId, 'thread');
		assert.equal(await reasonOf(conversationId), 'image');
		const both = await run({ attachmentCount: 1, thread: true });
		assert.equal(both.stored, both.reason);
		const next = await createConversation();
		await markRunStartProvenance(app.db, inputs(next, { imageCount: 1 }));
		await markRunStartProvenance(app.db, inputs(next, { thread: true }));
		assert.equal(await reasonOf(next), 'image');
	});

	it('conversationTaint is provenance, web and mcp together', async () => {
		const conversationId = await createConversation();
		assert.deepEqual(await conversationTaint(app.db, conversationId), { tainted: false, why: [] });
		await markProvenanceTaint(app.db, conversationId, 'attachment');
		const runId = randomUUID();
		await app.db.query(`insert into public.ai_runs (id, conversation_id, owner_id, status, model) values ($1, $2, $3, 'succeeded', 'm')`, [runId, conversationId, USER_A]);
		await app.db.query(
			`insert into public.ai_approvals (run_id, conversation_id, owner_id, workspace_id, tool, args, args_sha256, status, expires_at)
			 values ($1, $2, $3, $4, 'mcp_call', '{"serverLabel":"gh"}'::jsonb, 'h', 'executed', now())`,
			[runId, conversationId, USER_A, WORKSPACE_A],
		);
		const taint = await conversationTaint(app.db, conversationId);
		assert.equal(taint.tainted, true);
		assert.deepEqual(taint.why, ['attachment', 'mcp:gh']);
	});

	it('the mark is written before the first model request', async () => {
		const shared = await page('shared', USER_B);
		const conversationId = await createConversation();
		const callsAtMark: number[] = [];
		const original = app.db.query.bind(app.db);
		(app.db as { query: unknown }).query = (...args: unknown[]) => {
			if (typeof args[0] === 'string' && /update public\.ai_conversations[^;]*provenance_tainted_at/.test(args[0])) callsAtMark.push(mock.calls);
			return (original as (...a: unknown[]) => unknown)(...args);
		};
		const before = mock.calls;
		try {
			const response = await postRun(conversationId, randomUUID(), 'hello', undefined, tokenFor(USER_A, WORKSPACE_A), [shared]);
			await collect(new SseStream(response));
		} finally {
			(app.db as { query: unknown }).query = original;
		}
		assert.deepEqual(callsAtMark, [before]);
		assert.ok(mock.calls > before);
		assert.equal(await reasonOf(conversationId), 'shared_page');
	});

	/** Runs `body` with every query of the pool recorded, and those matching `fail` rejected. */
	async function spied<T>(fail: RegExp | null, body: (seen: string[]) => Promise<T>): Promise<T> {
		const seen: string[] = [];
		const original = app.db.query.bind(app.db);
		(app.db as { query: unknown }).query = (...args: unknown[]) => {
			const sql = typeof args[0] === 'string' ? args[0] : '';
			seen.push(sql);
			if (fail?.test(sql)) return Promise.reject(Object.assign(new Error('boom'), { code: 'XX000' }));
			return (original as (...a: unknown[]) => unknown)(...args);
		};
		try {
			return await body(seen);
		} finally {
			(app.db as { query: unknown }).query = original;
		}
	}

	const raw = (conversationId: string, userOf: AuthUser | undefined, over: object = {}) => ({
		conversationId, user: userOf, contextPages: [], sources: [], overview: null, viewTabs: [],
		attachmentCount: 0, imageCount: 0, skillIndex: [], customAgentId: null, thread: false, ...over,
	});

	it('a user outside the allowlist, or no user, gets one legacy mark and no other read', async () => {
		for (const who of [{ ...user, userId: USER_B }, undefined]) {
			const conversationId = await createConversation();
			const agentId = randomUUID();
			const seen = await spied(null, async (log) => {
				assert.equal(await markRunStart(app.db, raw(conversationId, who, { customAgentId: agentId })), 'legacy');
				return log;
			});
			assert.equal(seen.length, 1);
			assert.match(seen[0], /update public\.ai_conversations/);
			assert.equal(await reasonOf(conversationId), 'legacy');
		}
	});

	it('a failing check taints legacy and logs only a code', async () => {
		const conversationId = await createConversation();
		const warned: string[] = [];
		const warn = console.warn;
		console.warn = (line: unknown) => { warned.push(String(line)); };
		try {
			await spied(/ai_agents/, async () => {
				assert.equal(await markRunStart(app.db, raw(conversationId, user, { customAgentId: randomUUID() })), 'legacy');
			});
		} finally {
			console.warn = warn;
		}
		assert.equal(await reasonOf(conversationId), 'legacy');
		assert.deepEqual(warned, ['{"event":"provenance_check_failed","code":"XX000"}']);
	});

	it('a failing taint write propagates', async () => {
		const conversationId = await createConversation();
		await spied(/ai_agents|update public\.ai_conversations/, async () => {
			await assert.rejects(markRunStart(app.db, raw(conversationId, user, { customAgentId: randomUUID() })));
		});
	});

	it('a workspace skill with no skillId is foreign_skill', async () => {
		const entry = { id: 's', version: 1, source: 'workspace' as const, description: 'd' };
		assert.equal((await run({ skillIndex: [entry] })).stored, 'foreign_skill');
	});

	it('a run whose provenance cannot be written is refused, settled and marked failed', async () => {
		const shared = await page('shared', USER_B);
		const conversationId = await createConversation();
		const runId = randomUUID();
		const response = await spied(/update public\.ai_conversations[^;]*provenance_tainted_at/, () =>
			postRun(conversationId, runId, 'hello', undefined, tokenFor(USER_A, WORKSPACE_A), [shared]));
		assert.equal(response.status, 503);
		const row = (await app.db.query('select status, error, reserved_microusd from public.ai_runs where id = $1', [runId])).rows[0];
		assert.equal(row.status, 'failed');
		assert.equal(row.error, 'provenance_unavailable');
	});
});

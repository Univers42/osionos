/**
 * Read-time provenance (AM3 part 2): a tool that reads content the user did not
 * write taints the conversation BEFORE the model sees the result.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';
import { SseStream, collect } from './sse.ts';
import type { AuthUser } from '../src/auth.ts';

process.env.OSIONOS_AI_MODES = 'on';
process.env.OSIONOS_AI_MODES_USERS = '11111111-1111-4111-8111-111111111111';
const { startHarness, USER_A, USER_B, WORKSPACE_A } = await import('./harness.ts');
const { app, mock, bridge, postRun, tokenFor, createConversation } = await startHarness();
const { makeOnRead } = await import('../src/provenance/onRead.ts');
const { readContent } = await import('../src/provenance/readIds.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const user: AuthUser = { userId: USER_A, workspaceId: WORKSPACE_A, memberWorkspaces: [], isAdmin: false, issuedAtMs: Date.now(), expiresAtMs: null };

async function page(visibility: string, ownerId = USER_A): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, content) values ($1, $2, $3, 't', $4, '[{"content":"body"}]'::jsonb)`,
		[id, WORKSPACE_A, ownerId, visibility],
	);
	return id;
}

async function reasonOf(conversationId: string): Promise<string | null> {
	const row = await app.db.query('select provenance_reason from public.ai_conversations where id = $1', [conversationId]);
	return row.rows[0].provenance_reason;
}

/** What the hook stores after one read of `tool` returning `data`. */
async function reasonAfter(tool: string, data: unknown): Promise<string | null> {
	const conversationId = await createConversation();
	await makeOnRead(app.db, user, conversationId)(tool, data);
	return reasonOf(conversationId);
}

async function skillRow(createdBy: string, updatedBy: string, slug: string): Promise<void> {
	await app.db.query(
		`insert into public.ai_skills (workspace_id, slug, name, description, body, created_by, updated_by) values ($1, $2, 'n', 'd', 'b', $3, $4)`,
		[WORKSPACE_A, slug, createdBy, updatedBy],
	);
}

describe('read-time provenance', () => {
	beforeEach(async () => {
		await app.db.query('delete from public.osionos_workspace_members where workspace_id = $1', [WORKSPACE_A]);
		await app.db.query('delete from public.osionos_share_rules where workspace_id = $1', [WORKSPACE_A]);
		await app.db.query('delete from public.osionos_pages where workspace_id = $1', [WORKSPACE_A]);
		await app.db.query('delete from public.ai_skills where workspace_id = $1', [WORKSPACE_A]);
	});

	it('read_page of a shared page is shared_page; of a private own page is nothing', async () => {
		assert.equal(await reasonAfter('read_page', { pageId: await page('shared', USER_B) }), 'shared_page');
		assert.equal(await reasonAfter('read_page', { pageId: await page('private') }), null);
	});

	it('search_workspace with one shared chunk is shared_page', async () => {
		const own = await page('private');
		const shared = await page('shared', USER_B);
		assert.equal(await reasonAfter('search_workspace', { chunks: [{ pageId: own }] }), null);
		assert.equal(await reasonAfter('search_workspace', { chunks: [{ pageId: own }, { pageId: shared }] }), 'shared_page');
	});

	it('graph_neighbors with a shared via page or node is shared_title', async () => {
		const own = await page('private');
		const shared = await page('shared', USER_B);
		const node = (pageId: string, via: string | null) => ({ pageId, via, kind: 'link', depth: 1, title: 't' });
		assert.equal(await reasonAfter('graph_neighbors', { nodes: [node(own, null)], viaTitles: {} }), null);
		assert.equal(await reasonAfter('graph_neighbors', { nodes: [node(own, shared)], viaTitles: {} }), 'shared_title');
		assert.equal(await reasonAfter('graph_neighbors', { nodes: [node(shared, null)], viaTitles: {} }), 'shared_title');
	});

	it('load_skill: a foreign workspace skill is foreign_skill; own, built-in and user skills are not', async () => {
		await skillRow(USER_A, USER_A, 'mine');
		await skillRow(USER_A, USER_B, 'edited');
		const load = (id: string, source: string) => reasonAfter('load_skill', { id, version: 1, body: 'b', source });
		assert.equal(await load('mine', 'workspace'), null);
		assert.equal(await load('edited', 'workspace'), 'foreign_skill');
		assert.equal(await load('missing', 'workspace'), 'foreign_skill');
		assert.equal(await load('anything', 'builtin'), null);
		assert.equal(await load('anything', 'user'), null);
	});

	it('an unknown tool, or a known one with a shape it does not know, is untrusted_tool', async () => {
		assert.equal(await reasonAfter('brand_new_tool', { x: 1 }), 'untrusted_tool');
		assert.equal(await reasonAfter('read_page', { nothing: 1 }), 'untrusted_tool');
		assert.equal(await reasonAfter('read_page', null), 'untrusted_tool');
	});

	it('the view, memory, web and mcp tools read nothing here', async () => {
		for (const tool of ['open_page', 'open_panel', 'open_issue_report', 'suggest_agent', 'remember', 'web_fetch', 'web_search', 'mcp_x']) {
			assert.equal(readContent(tool, {}), 'none', tool);
			assert.equal(await reasonAfter(tool, {}), null, tool);
		}
	});

	it('a failing check taints legacy and logs only a code, even for a null rejection', async () => {
		const conversationId = await createConversation();
		const warned: string[] = [];
		const warn = console.warn;
		console.warn = (line: unknown) => { warned.push(String(line)); };
		const original = app.db.query.bind(app.db);
		let reject: unknown = Object.assign(new Error('boom'), { code: 'XX000' });
		(app.db as { query: unknown }).query = (...args: unknown[]) =>
			typeof args[0] === 'string' && /osionos_pages/.test(args[0]) ? Promise.reject(reject) : (original as (...a: unknown[]) => unknown)(...args);
		try {
			const hook = makeOnRead(app.db, user, conversationId);
			await hook('read_page', { pageId: randomUUID() });
			assert.equal(await reasonOf(conversationId), 'legacy');
			reject = null;
			await hook('read_page', { pageId: randomUUID() });
		} finally {
			(app.db as { query: unknown }).query = original;
			console.warn = warn;
		}
		assert.equal(warned[0], '{"event":"provenance_check_failed","code":"XX000"}');
		assert.equal(warned.length, 2);
	});

	it('the mark is in the database before the model gets the tool result', async () => {
		const shared = await page('shared', USER_B);
		const conversationId = await createConversation();
		const callsAtMark: number[] = [];
		const original = app.db.query.bind(app.db);
		(app.db as { query: unknown }).query = (...args: unknown[]) => {
			if (typeof args[0] === 'string' && /update public\.ai_conversations[^;]*provenance_tainted_at/.test(args[0])) callsAtMark.push(mock.calls);
			return (original as (...a: unknown[]) => unknown)(...args);
		};
		const before = mock.calls;
		mock.setOptions({ toolCall: { name: 'read_page', arguments: { pageId: shared } } });
		try {
			const response = await postRun(conversationId, randomUUID(), 'read it', undefined, tokenFor(USER_A, WORKSPACE_A));
			await collect(new SseStream(response));
		} finally {
			(app.db as { query: unknown }).query = original;
		}
		// One model request had been sent (the step that asked for the tool); the second had not.
		assert.deepEqual(callsAtMark, [before + 1]);
		assert.ok(mock.calls >= before + 2);
		assert.equal(await reasonOf(conversationId), 'shared_page');
	});
});

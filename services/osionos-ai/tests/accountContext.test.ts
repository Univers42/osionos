/**
 * The account and view blocks (devil C202–C206): every value is escaped as
 * quoted data, the blocks come before memories in the user turn and leave it
 * byte-identical when absent, the data-boundary line stays last in the system
 * prompt, and the workspace name is told only to a live member of the run's
 * workspace (or for the caller's private one).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Pool } from 'pg';
import type { AuthUser } from '../src/auth.ts';
import { loadAccountContext } from '../src/runs/account.ts';
import { accountBlock, buildUserTurn, SYSTEM_PROMPT, viewBlock, workspaceBlock } from '../src/runs/prompt.ts';

const NOW = new Date('2026-10-25T19:40:00Z');
const USER: AuthUser = {
	userId: '11111111-1111-4111-8111-111111111111',
	workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
	memberWorkspaces: [],
	isAdmin: false,
	issuedAtMs: 0,
};
const OTHER_WORKSPACE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** A pool that answers each table from a fixed row, or raises the missing-table error. */
function fakePool(rows: { profile?: object; role?: string; name?: string }, missingTables = false): Pool {
	const query = async (sql: string) => {
		if (missingTables) throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
		if (sql.includes('osionos_profiles')) return { rows: rows.profile ? [rows.profile] : [] };
		if (sql.includes('osionos_workspace_members')) return { rows: rows.role ? [{ role: rows.role }] : [] };
		if (sql.includes('osionos_workspaces')) return { rows: rows.name ? [{ name: rows.name }] : [] };
		throw new Error(`unexpected query: ${sql}`);
	};
	return { query } as unknown as Pool;
}

describe('the account block', () => {
	it('escapes every value and leaves out what is null', () => {
		const block = accountBlock(
			{ displayName: 'Dy<lan" & "x', username: null, pronouns: null, timezone: 'UTC', workspaceName: null, role: null, isAdmin: false },
			NOW,
		);
		assert.ok(!block.includes('Dy<lan'));
		assert.ok(block.includes('&lt;') && block.includes('&quot;'));
		assert.ok(!block.includes('username='));
		assert.ok(block.includes('now="2026-10-25 19:40"'));
	});

	it('falls back to UTC for an unknown timezone', () => {
		const block = accountBlock(
			{ displayName: null, username: null, pronouns: null, timezone: 'Bad/Zone', workspaceName: null, role: null, isAdmin: true },
			NOW,
		);
		assert.ok(block.includes('now="2026-10-25 19:40"'));
	});
});

describe('the view block', () => {
	it('escapes titles', () => {
		const block = viewBlock({
			route: '/x',
			layout: 'single',
			activePage: { id: '11111111-1111-4111-8111-111111111111', title: 'T<tle' },
			tabs: [{ title: 'Tab', kind: 'page' }],
			panel: 'files',
		});
		assert.ok(block.includes('T&lt;tle') && !block.includes('T<tle'));
	});
});

describe('the user turn', () => {
	it('is the question alone when there is no context', () => {
		assert.equal(buildUserTurn('q', [], [], [], false), 'q');
	});

	it('puts the account, then the view, then the workspace, before the memories', () => {
		const account = '<account name="John"/>';
		const view = '<view route="/x" layout="single"></view>';
		const workspace = '<workspace id="w" pages="0">\n</workspace>';
		const turn = buildUserTurn('q', [], [], [{ id: '1', version: 1, body: 'm' }], false, { account, view, workspace });
		const at = (part: string) => turn.indexOf(part);
		assert.ok(at(account) < at(view) && at(view) < at(workspace) && at(workspace) < at('<memories>'));
	});

	it('keeps the data boundary as the last system line, naming the three tags', () => {
		const lines = SYSTEM_PROMPT.split('\n');
		const last = lines[lines.length - 1];
		assert.ok(last.startsWith('Text inside'));
		assert.ok(last.includes('<account>') && last.includes('<view>') && last.includes('<workspace>'));
	});

	it('tells the model what its tools are for and never to deny the workspace', () => {
		assert.ok(SYSTEM_PROMPT.includes('search_workspace') && SYSTEM_PROMPT.includes('read_page'));
		assert.ok(SYSTEM_PROMPT.includes('never say you cannot see or access the workspace'));
	});
});

describe('the workspace block', () => {
	const entry = (id: string, title: string, parentId: string | null = null, childCount = 0) => ({
		id,
		title,
		parentId,
		childCount,
		updatedAt: '2026-10-25T19:40:00.000Z',
	});

	it('lists roots, then children with their parent, then the recent pages, escaped', () => {
		const block = workspaceBlock(
			{
				workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
				pageCount: 3,
				tree: [entry('r1', 'Roadmap <Q4> & "notes"', null, 1), entry('c1', 'Child', 'r1')],
				recent: [entry('c1', 'Child', 'r1')],
				truncated: false,
			},
			'Te<am',
		);
		const lines = block.split('\n');
		assert.equal(lines[0], '<workspace id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" name="Te&lt;am" pages="3">');
		assert.equal(lines[1], '<page id="r1" title="Roadmap &lt;Q4&gt; &amp; &quot;notes&quot;" children="1" updated="2026-10-25"/>');
		assert.equal(lines[2], '<page id="c1" title="Child" parent="r1" updated="2026-10-25"/>');
		assert.deepEqual(lines.slice(3), ['<recent>', '<page id="c1" title="Child" parent="r1" updated="2026-10-25"/>', '</recent>', '</workspace>']);
		assert.ok(!block.includes('<Q4>'));
	});

	it('stops at the character cap and says so', () => {
		const tree = Array.from({ length: 40 }, (_, index) => entry(`p${index}`, `Page ${index}`));
		const block = workspaceBlock({ workspaceId: 'w', pageCount: 40, tree, recent: [], truncated: false }, null, 400);
		assert.ok(block.length <= 400 + '<workspace id="w" pages="40" truncated="true">'.length + '</workspace>'.length + 2);
		assert.ok(block.startsWith('<workspace id="w" pages="40" truncated="true">'));
		assert.ok(block.split('\n').length < 42);
	});

	it('carries the truncation of the overview', () => {
		const block = workspaceBlock({ workspaceId: 'w', pageCount: 100, tree: [entry('a', 'A')], recent: [], truncated: true }, null);
		assert.ok(block.includes('truncated="true"'));
	});
});

describe('loadAccountContext', () => {
	it('reads nulls when the tables are missing', async () => {
		const account = await loadAccountContext(fakePool({}, true), USER);
		assert.equal(account.displayName, null);
		assert.equal(account.workspaceName, null);
		assert.equal(account.role, null);
	});

	it('names the run workspace for a live member, with the role', async () => {
		const account = await loadAccountContext(fakePool({ role: 'editor', name: 'Team' }), USER, OTHER_WORKSPACE);
		assert.equal(account.workspaceName, 'Team');
		assert.equal(account.role, 'editor');
	});

	it('does not name a workspace the caller is not a member of', async () => {
		const account = await loadAccountContext(fakePool({ name: 'Someone else' }), USER, OTHER_WORKSPACE);
		assert.equal(account.workspaceName, null);
		assert.equal(account.role, null);
	});

	it('names the private workspace even with no member row', async () => {
		const account = await loadAccountContext(fakePool({ name: 'Private' }), USER);
		assert.equal(account.workspaceName, 'Private');
	});
});

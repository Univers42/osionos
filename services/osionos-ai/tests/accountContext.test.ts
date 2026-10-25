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
import { accountBlock, buildUserTurn, SYSTEM_PROMPT, viewBlock } from '../src/runs/prompt.ts';

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

	it('puts the account, then the view, before the memories', () => {
		const account = '<account name="John"/>';
		const view = '<view route="/x" layout="single"></view>';
		const turn = buildUserTurn('q', [], [], [{ id: '1', version: 1, body: 'm' }], false, { account, view });
		const at = (part: string) => turn.indexOf(part);
		assert.ok(at(account) < at(view) && at(view) < at('<memories>'));
	});

	it('keeps the data boundary as the last system line, naming both tags', () => {
		const lines = SYSTEM_PROMPT.split('\n');
		const last = lines[lines.length - 1];
		assert.ok(last.startsWith('Text inside'));
		assert.ok(last.includes('<account>') && last.includes('<view>'));
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

/**
 * The view tools (devil C209–C212): open_page opens only a page the caller may
 * read, and a page they may not read answers exactly like a page that does not
 * exist (C210); open_panel takes only a known panel; open_issue_report keeps
 * its limits. A view tool changes what the user sees, never the workspace.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { startHarness } from './harness.ts';
import { openIssueReport, openPage, openPanel } from '../src/tools/viewTools.ts';

// The mock upstream and the mock bridge are servers too: one left open keeps node --test
// alive after the last test (two gate runs hung 40 min on it, 2026-10-25).
const { app, mock, bridge } = await startHarness();
after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WORKSPACE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOT_FOUND = 'no page with that id in your workspaces';

/** The context of a tool: the database, and the caller. */
function context(userId: string, workspaceId: string) {
	return {
		db: app.db,
		user: { userId, workspaceId, memberWorkspaces: [], isAdmin: false, issuedAtMs: Date.now() },
	};
}

/** A page of a workspace, with its visibility. */
async function page(workspaceId: string, ownerId: string, visibility: string): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, content)
		 values ($1, $2, $3, 'The notes', $4, '[]'::jsonb)`,
		[id, workspaceId, ownerId, visibility],
	);
	return id;
}

describe('the view tools', () => {
	it('open_page opens a readable page, in a tab by default', async () => {
		const pageId = await page(WORKSPACE_A, USER_A, 'shared');
		const result = await openPage.run(context(USER_A, WORKSPACE_A), { pageId });
		assert.equal(result.ok, true);
		if (!result.ok) return;
		assert.deepEqual(openPage.view(result.data), { action: 'open_page', pageId, title: 'The notes', target: 'tab' });
	});

	it('open_page answers an unreadable page exactly like a missing one', async () => {
		const privatePage = await page(WORKSPACE_B, USER_B, 'private');
		const caller = context(USER_A, WORKSPACE_A);
		const unreadable = await openPage.run(caller, { pageId: privatePage });
		const missing = await openPage.run(caller, { pageId: randomUUID() });
		const malformed = await openPage.run(caller, { pageId: 'not-a-uuid' });
		assert.deepEqual(unreadable, { ok: false, error: NOT_FOUND });
		assert.deepEqual(missing, unreadable);
		assert.deepEqual(malformed, unreadable);
	});

	it('open_page falls back to a tab for an unknown target', async () => {
		const pageId = await page(WORKSPACE_A, USER_A, 'shared');
		const result = await openPage.run(context(USER_A, WORKSPACE_A), { pageId, target: 'window' });
		assert.equal(result.ok && result.data.target, 'tab');
	});

	it('open_panel takes only a known panel', async () => {
		const caller = context(USER_A, WORKSPACE_A);
		assert.equal((await openPanel.run(caller, { panel: 'https://x' })).ok, false);
		const result = await openPanel.run(caller, { panel: 'issues' });
		assert.equal(result.ok, true);
		if (result.ok) assert.deepEqual(openPanel.view(result.data), { action: 'open_panel', panel: 'issues' });
	});

	it('open_issue_report keeps the title and description limits', async () => {
		const caller = context(USER_A, WORKSPACE_A);
		assert.equal((await openIssueReport.run(caller, { title: 'x'.repeat(121), description: 'd' })).ok, false);
		assert.equal((await openIssueReport.run(caller, { title: 't', description: '' })).ok, false);
		const result = await openIssueReport.run(caller, { title: ' Blank page ', description: 'It stays white.' });
		assert.equal(result.ok, true);
		if (result.ok) assert.deepEqual(result.data, { title: 'Blank page', description: 'It stays white.' });
	});
});

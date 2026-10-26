/**
 * The workspace overview (plan H1): the pages the caller can read, and only
 * those — a private page of someone else is not listed, counted or named; an
 * archived page is out; a readable child of an unreadable parent is a root;
 * a workspace the caller may not read reads as null, like a missing one.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { startHarness } from './harness.ts';
import { loadWorkspaceOverview } from '../src/runs/workspace.ts';
import { workspaceBlock } from '../src/runs/prompt.ts';

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

function user(userId: string, workspaceId: string) {
	return { userId, workspaceId, memberWorkspaces: [], isAdmin: false, issuedAtMs: Date.now() };
}

interface PageSpec {
	title: string;
	ownerId: string;
	visibility: 'private' | 'shared' | 'public';
	parentId?: string | null;
	archived?: boolean;
	updatedAt?: string;
}

async function page(workspaceId: string, spec: PageSpec): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, parent_page_id, archived_at, updated_at, content)
		 values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()), '[]'::jsonb)`,
		[id, workspaceId, spec.ownerId, spec.title, spec.visibility, spec.parentId ?? null, spec.archived ? new Date() : null, spec.updatedAt ?? null],
	);
	return id;
}

describe('the workspace overview', () => {
	let sharedRoot = '';
	let ownChild = '';
	let orphanChild = '';
	let privateOfB = '';

	before(async () => {
		await app.db.query('delete from public.osionos_pages where workspace_id in ($1, $2)', [WORKSPACE_A, WORKSPACE_B]);
		sharedRoot = await page(WORKSPACE_A, { title: 'Shared root', ownerId: USER_B, visibility: 'shared', updatedAt: '2026-10-20T00:00:00Z' });
		ownChild = await page(WORKSPACE_A, { title: 'Own child', ownerId: USER_A, visibility: 'private', parentId: sharedRoot, updatedAt: '2026-10-24T00:00:00Z' });
		privateOfB = await page(WORKSPACE_A, { title: 'B secret', ownerId: USER_B, visibility: 'private', updatedAt: '2026-10-25T00:00:00Z' });
		orphanChild = await page(WORKSPACE_A, { title: 'Shared under secret', ownerId: USER_B, visibility: 'shared', parentId: privateOfB, updatedAt: '2026-10-23T00:00:00Z' });
		await page(WORKSPACE_A, { title: 'Gone', ownerId: USER_A, visibility: 'shared', archived: true });
		await page(WORKSPACE_B, { title: 'Elsewhere', ownerId: USER_B, visibility: 'shared' });
	});

	it('lists what A can read, counts it, and roots a readable child of an unreadable parent', async () => {
		const overview = await loadWorkspaceOverview(app.db, user(USER_A, WORKSPACE_A), WORKSPACE_A);
		assert.ok(overview);
		assert.equal(overview.pageCount, 3);
		assert.deepEqual(
			overview.tree.map((entry) => [entry.title, entry.parentId, entry.childCount]),
			[
				['Shared under secret', null, 0],
				['Shared root', null, 1],
				['Own child', sharedRoot, 0],
			],
		);
		assert.deepEqual(overview.recent.map((entry) => entry.title), ['Own child', 'Shared under secret', 'Shared root']);
		assert.equal(overview.truncated, false);
		const block = workspaceBlock(overview, 'Team');
		assert.ok(!block.includes('B secret') && !block.includes(privateOfB) && !block.includes('Gone'));
		assert.ok(block.includes(`id="${ownChild}"`) && block.includes(`id="${orphanChild}"`));
	});

	it('is null for a workspace the caller may not read', async () => {
		assert.equal(await loadWorkspaceOverview(app.db, user(USER_A, WORKSPACE_A), WORKSPACE_B), null);
	});

	it('cuts at the entry limit and says so', async () => {
		const overview = await loadWorkspaceOverview(app.db, user(USER_A, WORKSPACE_A), WORKSPACE_A, { entries: 2, recent: 1 });
		assert.ok(overview);
		assert.equal(overview.tree.length, 2);
		assert.equal(overview.recent.length, 1);
		assert.equal(overview.pageCount, 3);
		assert.equal(overview.truncated, true);
	});
});

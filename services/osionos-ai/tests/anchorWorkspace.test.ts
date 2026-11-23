/**
 * Anchor and workspace checks at decide time (AM11, AM12). Each title names the
 * card reason that Task 15's autoVerdict maps the helper output to.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';
import { startHarness, USER_A, WORKSPACE_A, WORKSPACE_B } from './harness.ts';
import type { ApprovalRow } from '../src/approvals/types.ts';

const { app, mock, bridge } = await startHarness();
const { targetOf } = await import('../src/modes/targetPage.ts');
const { inAnchorSubtree, liveWorkspaceOf } = await import('../src/modes/anchor.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

async function page(workspaceId = WORKSPACE_A, parentId: string | null = null): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, collaborators, parent_page_id, content)
		 values ($1, $2, $3, 't', 'private', '[]'::jsonb, $4, '[]'::jsonb)`,
		[id, workspaceId, USER_A, parentId],
	);
	return id;
}

function row(tool: string, args: Record<string, unknown>): ApprovalRow {
	return { tool, args } as unknown as ApprovalRow;
}

describe('anchor and workspace at decide time', () => {
	beforeEach(async () => {
		for (const id of [WORKSPACE_A, WORKSPACE_B]) {
			await app.db.query(
				`insert into public.osionos_workspaces (id, owner_id, name, slug) values ($1, $2, 'w', $3) on conflict (id) do nothing`,
				[id, USER_A, `w-${id}`],
			);
		}
		await app.db.query('delete from public.osionos_pages where workspace_id in ($1, $2)', [WORKSPACE_A, WORKSPACE_B]);
	});

	it('targetOf: add_blocks and rename_page name the page, create_page the parent', () => {
		const id = randomUUID();
		assert.deepEqual(targetOf(row('add_blocks', { pageId: id, blocks: [] })), { pageId: id, kind: 'page' });
		assert.deepEqual(targetOf(row('rename_page', { pageId: id, title: 'x' })), { pageId: id, kind: 'page' });
		assert.deepEqual(targetOf(row('create_page', { title: 'x', workspaceId: WORKSPACE_A, parentPageId: id })), { pageId: id, kind: 'parent' });
	});

	it('no_anchor: create_page with a null parent, and fail closed on bad rows', () => {
		assert.equal(targetOf(row('create_page', { title: 'x', workspaceId: WORKSPACE_A })), null);
		assert.equal(targetOf(row('add_blocks', { pageId: 'nope' })), null);
		assert.equal(targetOf(row('add_blocks', {})), null);
		assert.equal(targetOf(row('archive_page', { pageId: randomUUID() })), null);
	});

	it('outside_workspace: a target in WORKSPACE_B', async () => {
		const id = await page(WORKSPACE_B);
		assert.equal(await liveWorkspaceOf(app.db, id), WORKSPACE_B);
		assert.notEqual(await liveWorkspaceOf(app.db, id), WORKSPACE_A);
	});

	it('outside_workspace: a create_page parent in WORKSPACE_B', async () => {
		const parent = await page(WORKSPACE_B);
		const target = targetOf(row('create_page', { title: 'x', workspaceId: WORKSPACE_A, parentPageId: parent }));
		assert.notEqual(await liveWorkspaceOf(app.db, target!.pageId), WORKSPACE_A);
	});

	it('outside_workspace: an archived or missing target has no live workspace', async () => {
		const id = await page();
		assert.equal(await liveWorkspaceOf(app.db, id), WORKSPACE_A);
		await app.db.query('update public.osionos_pages set archived_at = now() where id = $1', [id]);
		assert.equal(await liveWorkspaceOf(app.db, id), null);
		assert.equal(await liveWorkspaceOf(app.db, randomUUID()), null);
	});

	it('anchor passes: the anchor itself and a deep descendant', async () => {
		const anchor = await page();
		const leaf = await page(WORKSPACE_A, await page(WORKSPACE_A, anchor));
		assert.equal(await inAnchorSubtree(app.db, anchor, anchor), true);
		assert.equal(await inAnchorSubtree(app.db, leaf, anchor), true);
	});

	it('outside_anchor: moved out after propose', async () => {
		const anchor = await page();
		const child = await page(WORKSPACE_A, anchor);
		assert.equal(await inAnchorSubtree(app.db, child, anchor), true);
		await app.db.query('update public.osionos_pages set parent_page_id = null where id = $1', [child]);
		assert.equal(await inAnchorSubtree(app.db, child, anchor), false);
	});

	it('outside_anchor: an archived link in the chain, or a sibling', async () => {
		const anchor = await page();
		const mid = await page(WORKSPACE_A, anchor);
		const leaf = await page(WORKSPACE_A, mid);
		await app.db.query('update public.osionos_pages set archived_at = now() where id = $1', [mid]);
		assert.equal(await inAnchorSubtree(app.db, leaf, anchor), false);
		assert.equal(await inAnchorSubtree(app.db, await page(), anchor), false);
	});

	it('outside_anchor: deeper than 64 links is over-carded', async () => {
		const anchor = await page();
		let tip = anchor;
		for (let i = 0; i < 70; i++) tip = await page(WORKSPACE_A, tip);
		assert.equal(await inAnchorSubtree(app.db, tip, anchor), false);
	});

	it('outside_anchor: a malformed id is false, not an error', async () => {
		assert.equal(await inAnchorSubtree(app.db, 'nope', randomUUID()), false);
		assert.equal(await liveWorkspaceOf(app.db, 'nope'), null);
	});
});

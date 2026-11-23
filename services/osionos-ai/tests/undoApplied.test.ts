import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Undo of an applied write (AM8): add_blocks, rename_page and create_page are
 * undone only while the page still reads the way the write left it; every
 * other state is a named refusal and the page is left alone.
 */
const { app, bridge, getOwnedApproval, USER_A, AI, HUMAN, page, executed, undo, recordedBlock, blocksRow, writes } = await import('./undoAppliedFixture.ts');

describe('add_blocks undo', () => {
	it('removes exactly the recorded blocks, carrying baseVersion', async () => {
		const pageId = await page([HUMAN, AI]);
		const result = await undo(await blocksRow(pageId));
		assert.deepEqual(result, { ok: true });
		const patch = writes()[0];
		assert.equal(patch.method, 'PATCH');
		assert.deepEqual(patch.body, { content: [HUMAN], baseVersion: 3 });
		assert.deepEqual(bridge.pageContent(pageId)?.content, [HUMAN]);
	});

	it('refuses when a block is missing', async () => {
		const pageId = await page([HUMAN]);
		assert.deepEqual(await undo(await blocksRow(pageId)), { ok: false, code: 'changed_since' });
		assert.equal(writes().length, 0);
	});

	it('refuses when a block moved under another parent', async () => {
		const pageId = await page([{ ...HUMAN, children: [AI] }]);
		assert.deepEqual(await undo(await blocksRow(pageId)), { ok: false, code: 'changed_since' });
		assert.equal(writes().length, 0);
	});

	it('refuses when a block was edited (R5: the edit is a conflict copy, the AI text stays)', async () => {
		const pageId = await page([HUMAN, { ...AI, content: 'edited by a human' }]);
		assert.deepEqual(await undo(await blocksRow(pageId)), { ok: false, code: 'changed_since' });
		assert.equal(writes().length, 0);
	});

	it('refuses when a block gained a child', async () => {
		const pageId = await page([HUMAN, { ...AI, children: [{ id: 'c', type: 'paragraph', content: 'kid' }] }]);
		assert.deepEqual(await undo(await blocksRow(pageId)), { ok: false, code: 'changed_since' });
		assert.equal(writes().length, 0);
	});

	it('a version race (409 between read and PATCH) is changed_since and writes nothing', async () => {
		const pageId = await page([HUMAN, AI]);
		bridge.onPatch = () => {
			const stored = bridge.pageContent(pageId);
			if (stored) stored.version = (stored.version ?? 0) + 1;
		};
		const approval = await blocksRow(pageId);
		assert.deepEqual(await undo(approval), { ok: false, code: 'changed_since' });
		bridge.onPatch = undefined;
		assert.equal(writes().length, 1, 'one PATCH, refused; no second write');
		assert.deepEqual(bridge.pageContent(pageId)?.content, [HUMAN, AI]);
		// The refusal released the claim: the retry can go.
		assert.deepEqual(await undo((await getOwnedApproval(app.db, { id: approval.id, ownerId: USER_A }))!), { ok: true });
	});

	it('a page with no contentVersion is not_undoable and nothing is sent', async () => {
		const pageId = await page([HUMAN, AI]);
		bridge.seedPage(pageId, [HUMAN, AI], null);
		const approval = await blocksRow(pageId);
		assert.deepEqual(await undo(approval), { ok: false, code: 'not_undoable' });
		assert.equal(writes().length, 0);
		const row = await getOwnedApproval(app.db, { id: approval.id, ownerId: USER_A });
		assert.equal((row!.result as { undoneAt?: unknown }).undoneAt, undefined);
	});

	it('a second undo is already_undone', async () => {
		const pageId = await page([HUMAN, AI]);
		const approval = await blocksRow(pageId);
		assert.deepEqual(await undo(approval), { ok: true });
		const again = await getOwnedApproval(app.db, { id: approval.id, ownerId: USER_A });
		assert.deepEqual(await undo(again!), { ok: false, code: 'already_undone' });
	});

	it('a failed bridge write releases the claim', async () => {
		const pageId = await page([HUMAN, AI]);
		const approval = await blocksRow(pageId);
		bridge.failNextWith(500, 1);
		assert.deepEqual(await undo(approval), { ok: false, code: 'failed' });
		const row = await getOwnedApproval(app.db, { id: approval.id, ownerId: USER_A });
		assert.equal((row!.result as { undoneAt?: unknown }).undoneAt, undefined);
	});
});

describe('rename_page and create_page undo', () => {
	it('rename_page puts the previous title back', async () => {
		const pageId = await page([], 'New name');
		const approval = await executed('rename_page', { pageId, title: 'New name' }, { pageId, previousTitle: 'Old name', appliedTitle: 'New name' });
		assert.deepEqual(await undo(approval), { ok: true });
		assert.equal(bridge.pageContent(pageId)?.title, 'Old name');
	});

	it('rename_page applied with an empty title still matches the bridge\'s Untitled', async () => {
		const pageId = await page([], '');
		const approval = await executed('rename_page', { pageId, title: '' }, { pageId, previousTitle: 'Old name', appliedTitle: '' });
		assert.deepEqual(await undo(approval), { ok: true });
		assert.equal(bridge.pageContent(pageId)?.title, 'Old name');
	});

	it('rename_page applied as "Untitled" matches too', async () => {
		const pageId = await page([], 'Untitled');
		const approval = await executed('rename_page', { pageId, title: 'Untitled' }, { pageId, previousTitle: 'Old name', appliedTitle: 'Untitled' });
		assert.deepEqual(await undo(approval), { ok: true });
	});

	it('rename_page refuses when the title changed since', async () => {
		const pageId = await page([], 'Human title');
		const approval = await executed('rename_page', { pageId, title: 'New name' }, { pageId, previousTitle: 'Old name', appliedTitle: 'New name' });
		assert.deepEqual(await undo(approval), { ok: false, code: 'changed_since' });
		assert.equal(writes().length, 0);
	});

	it('create_page archives the created page', async () => {
		const pageId = await page([], 'Made by AI');
		const approval = await executed('create_page', { title: 'Made by AI' }, { createdPageId: pageId, parentPageId: null });
		assert.deepEqual(await undo(approval), { ok: true });
		assert.ok(bridge.pageContent(pageId)?.archivedAt);
	});

	it('create_page refuses when the page has a human child', async () => {
		const pageId = await page([], 'Made by AI');
		await page([], 'Human child', pageId);
		const approval = await executed('create_page', { title: 'Made by AI' }, { createdPageId: pageId, parentPageId: null });
		assert.deepEqual(await undo(approval), { ok: false, code: 'changed_since' });
		assert.equal(writes().length, 0);
	});

	it('create_page ignores a child another AI row of the same turn created', async () => {
		const parent = await page([], 'Made by AI');
		const child = await page([], 'AI child', parent);
		await executed('create_page', { title: 'AI child' }, { createdPageId: child, parentPageId: parent });
		const approval = await executed('create_page', { title: 'Made by AI' }, { createdPageId: parent, parentPageId: null });
		assert.deepEqual(await undo(approval), { ok: true });
	});
});

describe('add_blocks undo against a JSONB page', () => {
	it('still undoes a block whose content keys the database stores in another order', async () => {
		const rich = { id: 'rich', type: 'paragraph', content: { text: 'hi', marks: [], align: 'left', z: 1 } };
		const pageId = await page([HUMAN, rich]);
		const row = await executed('add_blocks', { pageId }, { pageId, version: 3, blocks: [recordedBlock(rich)], summary: 's' });
		assert.deepEqual(await undo(row), { ok: true });
		assert.deepEqual(bridge.pageContent(pageId)?.content, [HUMAN]);
	});
});

describe('a lost answer to the undo write', () => {
	it('add_blocks: the write landed, so the claim is kept and the undo is ok', async () => {
		const pageId = await page([HUMAN, AI]);
		const approval = await blocksRow(pageId);
		bridge.dropNextPatchAnswers(1, { apply: true });
		assert.deepEqual(await undo(approval), { ok: true });
		const row = await getOwnedApproval(app.db, { id: approval.id, ownerId: USER_A });
		assert.ok((row!.result as { undoneAt?: unknown }).undoneAt, 'the claim stays');
		assert.deepEqual(bridge.pageContent(pageId)?.content, [HUMAN]);
	});

	it('add_blocks: the write did not land, so the claim is released', async () => {
		const pageId = await page([HUMAN, AI]);
		const approval = await blocksRow(pageId);
		bridge.dropNextPatchAnswers(1, { apply: false });
		assert.deepEqual(await undo(approval), { ok: false, code: 'failed' });
		const row = await getOwnedApproval(app.db, { id: approval.id, ownerId: USER_A });
		assert.equal((row!.result as { undoneAt?: unknown }).undoneAt, undefined);
		assert.deepEqual(await undo(row!), { ok: true });
	});

	it('rename_page: the write landed, so the claim is kept', async () => {
		const pageId = await page([], 'New name');
		const approval = await executed('rename_page', { pageId, title: 'New name' }, { pageId, previousTitle: 'Old name', appliedTitle: 'New name' });
		bridge.dropNextPatchAnswers(1, { apply: true });
		assert.deepEqual(await undo(approval), { ok: true });
		const row = await getOwnedApproval(app.db, { id: approval.id, ownerId: USER_A });
		assert.ok((row!.result as { undoneAt?: unknown }).undoneAt);
	});

	it('create_page: the archive landed, so the claim is kept', async () => {
		const pageId = await page([], 'Made by AI');
		const approval = await executed('create_page', { title: 'Made by AI' }, { createdPageId: pageId, parentPageId: null });
		bridge.dropNextPatchAnswers(1, { apply: true });
		assert.deepEqual(await undo(approval), { ok: true });
		const row = await getOwnedApproval(app.db, { id: approval.id, ownerId: USER_A });
		assert.ok((row!.result as { undoneAt?: unknown }).undoneAt);
	});
});

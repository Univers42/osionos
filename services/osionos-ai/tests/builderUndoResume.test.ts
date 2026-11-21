import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import {
	allItems, app, approvalStatus, bridge, buildPartial, buildPosts, closeBuilderHarness, holdPatch, holdPost,
	installUndoHooks, patchedIds, resume, undo,
} from './undoHarness.ts';

/**
 * osionos#333 (groot ADR 0071): an undo and a resume of the same partial
 * approval. Every order is forced by a hook parked inside the mock bridge, never
 * by a sleep, so each case runs the same interleaving every time.
 */
after(closeBuilderHarness);

const code = (answer: { body: unknown }) => (answer.body as { code?: string }).code;

describe('builder undo against resume (osionos#333)', () => {
	installUndoHooks();

	it('Q8 a resume after an undo never POSTs under an undone parent', async () => {
		const { approvalId, ids } = await buildPartial();
		assert.equal((await undo(approvalId)).status, 200);
		const items = await allItems(app.db, approvalId);
		assert.equal(items.find((item) => item.item_key === 'home')!.status, 'undone');
		bridge.reset();

		const resumed = await resume(approvalId);
		assert.equal(resumed.status, 200);
		const undonePages = new Set([ids.home!, ids.about!]);
		const underUndone = buildPosts().filter((post) => undonePages.has(post.body.parentPageId ?? ''));
		assert.deepEqual(underUndone, [], 'no POST names an undone page as its parent');
		const notes = (await allItems(app.db, approvalId)).find((item) => item.item_key === 'notes')!;
		assert.equal(notes.status, 'failed');
		assert.equal(notes.error, 'its parent was undone');
	});

	it('Q9(a) an undo while a resume is held inside a POST is 409 and PATCHes nothing', async () => {
		const { approvalId } = await buildPartial();
		const held = holdPost('Notes');
		const resuming = resume(approvalId);
		await held.reached;

		const refused = await undo(approvalId);
		held.release();
		assert.equal(refused.status, 409);
		assert.equal(code(refused), 'approval_busy');
		assert.deepEqual(patchedIds(), [], 'the losing undo makes no bridge call');
		assert.equal((await resuming).status, 200);
	});

	it('Q9(b) a resume while an undo is held inside a PATCH is 409 and POSTs nothing', async () => {
		const { approvalId, ids } = await buildPartial();
		const held = holdPatch(ids.about!);
		const undoing = undo(approvalId);
		await held.reached;

		const refused = await resume(approvalId);
		held.release();
		assert.equal(refused.status, 409);
		assert.equal(code(refused), 'approval_not_partial');
		assert.deepEqual(buildPosts(), [], 'the losing resume makes no POST');
		assert.equal((await undoing).status, 200);
		assert.equal(await approvalStatus(approvalId), 'partial', 'the undo hands the row back');
	});

	it('Q9(c) of two undos on one partial approval exactly one is 409', async () => {
		const { approvalId, ids } = await buildPartial();
		const held = holdPatch(ids.about!);
		const first = undo(approvalId);
		await held.reached;

		const second = await undo(approvalId);
		held.release();
		const statuses = [(await first).status, second.status];
		assert.deepEqual(statuses, [200, 409]);
		assert.equal(code(second), 'approval_busy');
	});
});


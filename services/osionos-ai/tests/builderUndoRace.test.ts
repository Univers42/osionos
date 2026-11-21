import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import {
	WORKSPACE_A, allItems, app, bridge, buildPlan, closeBuilderHarness, holdPatch,
	installUndoHooks, patchedIds, seedBuiltPages, undo,
} from './undoHarness.ts';

/** C159: two undos racing on one approval. */
after(closeBuilderHarness);

describe('builder undo races', () => {
	installUndoHooks();

	it('C159 two concurrent undos archive each page exactly once', async () => {
		const { approvalId, ids } = await buildPlan();
		await seedBuiltPages(approvalId);
		bridge.reset();

		// Undo A is parked inside the child's PATCH; undo B runs to the end meanwhile.
		const held = holdPatch(ids.notes!);
		const first = undo(approvalId);
		await held.reached;
		const second = await undo(approvalId);
		held.release();
		const one = await first;
		assert.ok([one.status, second.status].every((status) => status === 200 || status === 409));

		const patched = patchedIds();
		const unique = new Set(patched);
		assert.equal(unique.size, 3, 'three built pages');
		for (const id of unique) {
			assert.equal(patched.filter((candidate) => candidate === id).length, 1, `${id} is PATCHed once`);
		}
	});

	it('C159 a user page under a built child keeps the child and the parent', async () => {
		const { approvalId, ids } = await buildPlan();
		await seedBuiltPages(approvalId);
		const grandchild = randomUUID();
		await app.db.query(
			`insert into public.osionos_pages (id, workspace_id, parent_page_id, title) values ($1, $2, $3, 'G')`,
			[grandchild, WORKSPACE_A, ids.notes],
		);
		bridge.reset();

		const answer = await undo(approvalId);
		assert.equal(answer.status, 200);
		const patched = patchedIds();
		assert.deepEqual(new Set(patched), new Set([ids.about!]), 'only the childless page is archived');
		const items = await allItems(app.db, approvalId);
		assert.equal(items.find((item) => item.item_key === 'notes')!.status, 'done');
		assert.equal(items.find((item) => item.item_key === 'home')!.status, 'done');
		const row = await app.db.query('select archived_at from public.osionos_pages where id = $1', [grandchild]);
		assert.equal(row.rows[0].archived_at, null, 'the user page is never archived');
	});

	it('C159 a child whose held PATCH fails after its parent was archived stays done', async () => {
		const { approvalId, ids } = await buildPlan();
		await seedBuiltPages(approvalId);
		bridge.reset();

		// The mock models the bridge cascade: archiving a page stamps its live children.
		const held = holdPatch(ids.notes!, { fail: true });
		const parentHook = bridge.onPatch!;
		bridge.onPatch = async (call) => {
			await parentHook(call);
			await app.db.query(
				'update public.osionos_pages set archived_at = now() where parent_page_id = $1::uuid and archived_at is null',
				[decodeURIComponent(call.path.slice('/api/pages/'.length))],
			);
		};
		const first = undo(approvalId);
		await held.reached;
		await undo(approvalId);
		held.release();
		assert.equal((await first).status, 200);

		const items = await allItems(app.db, approvalId);
		const notes = items.find((item) => item.item_key === 'notes')!;
		assert.equal(notes.status, 'done');
		assert.equal(notes.error, 'the bridge refused the write (500)');
		assert.equal(items.find((item) => item.item_key === 'home')!.status, 'undone');
		const row = await app.db.query('select archived_at from public.osionos_pages where id = $1', [ids.notes]);
		assert.notEqual(row.rows[0].archived_at, null, 'the cascade from the parent archived the child');
	});
});

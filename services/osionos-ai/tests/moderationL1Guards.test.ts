import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { JobWorker } from '../src/jobs/worker.ts';
import {
	AUTHOR, DATABASE_URL, PAGE_ARCHIVED, PAGE_PRIVATE, WS_PUBLIC, comment, events, handler, installHooks, job, logs, mock, pool, ready, row, signal,
} from './moderationHarness.ts';

/** The guards of the L1 handler: stale content, private content, a classifier that is down, the worker. */

installHooks();

describe('the L1 moderation handler: guards', { timeout: 60_000, skip: ready ? false : 'the moderation migration was not applied' }, () => {
	it('content edited after the enqueue (sha mismatch): no row, no state change (C89)', async () => {
		const id = await comment('feed_comment', 'toxic v1');
		const stale = job('feed_comment', id, 'toxic v1');
		await pool.query('update public.osionos_feed_comments set content = $2 where id = $1', [id, 'kind v2']);
		await handler('hold')(stale, signal);
		assert.equal((await events(id)).length, 0);
		assert.equal((await row('feed_comment', id)).moderation_state, 'visible');
	});

	it('content edited while the classifier runs: the verdict of v1 never lands on v2 (C89)', async () => {
		const id = await comment('feed_comment', 'toxic v1');
		const queued = job('feed_comment', id, 'toxic v1');
		mock.setOptions({
			onRequest: async () => {
				await pool.query('update public.osionos_feed_comments set content = $2 where id = $1', [id, 'kind v2']);
			},
		});
		await handler('hold')(queued, signal);
		assert.equal((await events(id)).length, 0);
		const after = await row('feed_comment', id);
		assert.equal(after.moderation_state, 'visible');
		assert.equal(after.content, 'kind v2');
	});

	it('a comment on a private page: no row, and the classifier is never asked (C94)', async () => {
		const content = 'toxic but private';
		const id = await comment('page_comment', content, PAGE_PRIVATE);
		const asked = mock.bodies.length;
		await handler('hold')(job('page_comment', id, content), signal);
		assert.equal((await events(id)).length, 0);
		assert.equal(mock.bodies.length, asked);
		assert.equal((await row('page_comment', id)).moderation_state, 'visible');
	});

	it('a comment on an archived page, a vanished comment, an unknown subject kind: no row, no throw', async () => {
		const content = 'toxic archived';
		const archived = await comment('feed_comment', content, PAGE_ARCHIVED);
		await handler('hold')(job('feed_comment', archived, content), signal);
		assert.equal((await events(archived)).length, 0);

		const gone = randomUUID();
		await handler('hold')(job('feed_comment', gone, 'x'), signal);
		assert.equal((await events(gone)).length, 0);

		const unknown = { ...job('feed_comment', randomUUID(), 'x'), subjectKind: 'message' };
		const once = handler('hold');
		await once(unknown, signal);
		assert.equal((await events(unknown.subjectId)).length, 0);
		await once(unknown, signal);
		assert.equal(logs.filter((entry) => entry.event === 'unknown_subject_kind').length, 1);
	});

	it('a comment whose workspace is public is moderated even if its page is private', async () => {
		const page = randomUUID();
		await pool.query(
			`insert into public.osionos_pages (id, workspace_id, owner_id, visibility) values ($1, $2, $3, 'private')`,
			[page, WS_PUBLIC, AUTHOR],
		);
		const content = 'toxic in a public workspace';
		const id = await comment('feed_comment', content, page);
		await handler('log')(job('feed_comment', id, content, WS_PUBLIC), signal);
		assert.equal((await events(id)).length, 1);
	});

	it('end to end: a comment inserted on a public page is drained by the JobWorker', async () => {
		await pool.query('delete from public.ai_jobs');
		const content = 'toxic via the trigger';
		const worker = new JobWorker({
			pool,
			databaseUrl: DATABASE_URL,
			kind: 'moderate',
			handle: handler('hold'),
			pollMs: 100,
			log: () => undefined,
		});
		await worker.start();
		try {
			const id = await comment('page_comment', content);
			const deadline = Date.now() + 10_000;
			while (Date.now() < deadline && (await events(id)).length === 0) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			assert.equal((await events(id)).length, 1);
			assert.equal((await row('page_comment', id)).moderation_state, 'held');
			const left = await pool.query('select 1 from public.ai_jobs where subject_id = $1', [id]);
			assert.equal(left.rowCount, 0);
		} finally {
			await worker.stop();
		}
	});
});

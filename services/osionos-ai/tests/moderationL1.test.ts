import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	GOOD_HASH, PAGE_PUBLIC, WS_PRIVATE, AUTHOR, comment, events, handler, installHooks, job, logs, mock, pool, ready, row, sha, signal,
} from './moderationHarness.ts';

/** The decisions of the L1 handler: what the audit row says and what the comment becomes. */

installHooks();

describe('the L1 moderation handler: decisions', { timeout: 60_000, skip: ready ? false : 'the moderation migration was not applied' }, () => {
	for (const kind of ['feed_comment', 'page_comment'] as const) {
		it(`${kind}: toxic in hold mode writes the audit row and holds the comment, content untouched`, async () => {
			const content = 'you are toxic trash';
			const id = await comment(kind, content);
			await handler('hold')(job(kind, id, content), signal);

			const rows = await events(id);
			assert.equal(rows.length, 1);
			const event = rows[0];
			assert.equal(event.layer, 'l1');
			assert.equal(event.action, 'hold');
			assert.equal(event.mode, 'hold');
			assert.equal(event.actor_id, null);
			assert.equal(event.subject_kind, kind);
			assert.equal(event.workspace_id, WS_PRIVATE);
			assert.equal(event.author_id, AUTHOR);
			assert.equal(event.content_sha256, sha(content));
			assert.equal(event.policy_hash, GOOD_HASH);
			assert.deepEqual(event.scores, { toxic: 0.97 });
			assert.equal(event.reason, null);

			const after = await row(kind, id);
			assert.equal(after.moderation_state, 'held');
			assert.notEqual(after.moderation_changed_at, null);
			assert.equal(after.content, content);
		});
	}

	it('toxic in log mode records the would-be action and changes nothing else', async () => {
		const content = 'toxic words';
		const id = await comment('feed_comment', content);
		await handler('log')(job('feed_comment', id, content), signal);
		const [event] = await events(id);
		assert.equal(event.action, 'hold');
		assert.equal(event.mode, 'log');
		const after = await row('feed_comment', id);
		assert.equal(after.moderation_state, 'visible');
		assert.equal(after.moderation_changed_at, null);
	});

	it('a benign comment gets an allow row and stays visible', async () => {
		const content = 'lovely page';
		const id = await comment('page_comment', content);
		await handler('hold')(job('page_comment', id, content), signal);
		const [event] = await events(id);
		assert.equal(event.action, 'allow');
		assert.equal(event.mode, 'hold');
		assert.deepEqual(event.scores, { toxic: 0.03 });
		assert.equal((await row('page_comment', id)).moderation_state, 'visible');
	});


	it('the classifier down: the handler throws, no row, the comment stays visible (C90)', async () => {
		const content = 'toxic text';
		const id = await comment('feed_comment', content);
		mock.setOptions({ fail: true });
		await assert.rejects(handler('hold')(job('feed_comment', id, content), signal), (error: unknown) => {
			assert.ok(!String((error as Error).message).includes(content));
			return true;
		});
		assert.equal((await events(id)).length, 0);
		assert.equal((await row('feed_comment', id)).moderation_state, 'visible');
	});

	it('a policy that is not the calibrated one runs in log mode even if the env says hold (C85)', async () => {
		const content = 'toxic text';
		const id = await comment('feed_comment', content);
		await handler('hold', 'f'.repeat(64))(job('feed_comment', id, content), signal);
		const [event] = await events(id);
		assert.equal(event.mode, 'log');
		assert.equal(event.action, 'hold');
		assert.equal((await row('feed_comment', id)).moderation_state, 'visible');
	});

	it('on never removes: it holds (C83)', async () => {
		const content = 'toxic text';
		const id = await comment('page_comment', content);
		await handler('on')(job('page_comment', id, content), signal);
		const [event] = await events(id);
		assert.equal(event.mode, 'hold');
		assert.equal(event.action, 'hold');
		assert.equal((await row('page_comment', id)).moderation_state, 'held');
	});

	it('the toxic label may be named LABEL_1', async () => {
		mock.setOptions({ toxicLabel: 'LABEL_1' });
		const content = 'toxic text';
		const id = await comment('feed_comment', content);
		await handler('log')(job('feed_comment', id, content), signal);
		assert.deepEqual((await events(id))[0].scores, { toxic: 0.97 });
	});

	it('a held comment edited to kind text stays held, and the new verdict is an audit row (C89)', async () => {
		const id = await comment('feed_comment', 'toxic v1');
		await handler('hold')(job('feed_comment', id, 'toxic v1'), signal);
		await pool.query('update public.osionos_feed_comments set content = $2 where id = $1', [id, 'kind v2']);
		await handler('hold')(job('feed_comment', id, 'kind v2'), signal);
		assert.equal((await row('feed_comment', id)).moderation_state, 'held');
		assert.deepEqual((await events(id)).map((event) => event.action), ['hold', 'allow']);
	});

	it('log lines carry ids, action and mode, never the text or the score (C92)', async () => {
		const content = 'toxic secret words';
		const id = await comment('feed_comment', content);
		await handler('hold')(job('feed_comment', id, content), signal);
		const text = JSON.stringify(logs);
		assert.ok(!text.includes('secret words'));
		assert.ok(!text.includes('0.97'));
		assert.ok(logs.some((entry) => entry.event === 'moderation_decision' && entry.action === 'hold' && entry.mode === 'hold'));
	});

});

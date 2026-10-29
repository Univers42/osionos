import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { startHarness, USER_A, USER_B, WORKSPACE_A } from './harness.ts';
import { SseStream, collect } from './sse.ts';

/**
 * add_blocks: the assistant writes text into a page that exists.
 *
 * The proposal writes nothing and refuses what the card could not show
 * honestly (an archived page, a media block, an anchor it cannot name); the
 * approved write goes through the bridge's atomic append with minted ids and
 * the approval id as its idempotency key; and the outcome says where the
 * blocks really landed (devil C226–C240).
 */
const { app, bridge, mock, postRun, tokenFor, createConversation, call } = await startHarness();
const { addBlocks, anchorOf, ADD_MAX_BYTES } = await import('../src/tools/writeTools.ts');
const { appendOutcome, bridgeWriteOf } = await import('../src/approvals/execute.ts');

const USER = { userId: USER_A, workspaceId: WORKSPACE_A, memberWorkspaces: [], isAdmin: false, issuedAtMs: 0 };
/** The context a write tool runs in: the database and the caller. */
const CTX = { db: app.db, user: USER };

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

/** A page of the caller's workspace, with the given top-level blocks, known to the mock bridge too. */
async function page(content: unknown[] = [], options: { owner?: string; archived?: boolean } = {}): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, content, archived_at)
		 values ($1, $2, $3, 'The notes', $4, $5::jsonb, $6)`,
		[
			id,
			WORKSPACE_A,
			options.owner ?? USER_A,
			options.owner ? 'private' : 'shared',
			JSON.stringify(content),
			options.archived ? new Date() : null,
		],
	);
	bridge.seedPage(id, content, 3);
	return id;
}

/** A run in which the model asks for add_blocks: the id of the approval. */
async function ask(args: Record<string, unknown>): Promise<string> {
	mock.setOptions({
		preDelayMs: 0,
		chunkCount: 2,
		chunkGapMs: 0,
		fail: false,
		toolCall: { name: 'add_blocks', arguments: args },
		toolCallTrigger: 'do it',
		toolCallEveryStep: false,
		parallelToolCalls: 1,
		usage: null,
	});
	const conversationId = await createConversation();
	const events = await collect(new SseStream(await postRun(conversationId, randomUUID(), 'do it')));
	const asked = events.filter((event) => event.event === 'permission.asked');
	assert.equal(asked.length, 1, 'the run asked once');
	return String((asked[0].data as { approvalId: string }).approvalId);
}

function decide(approvalId: string): Promise<{ status: number; body: Record<string, unknown> | null }> {
	return call(`/api/ai/approvals/${approvalId}`, {
		method: 'POST',
		token: tokenFor(USER_A, WORKSPACE_A),
		body: { decision: 'approve' },
	});
}

async function approvalRow(id: string) {
	const row = await app.db.query('select status, args, result, error from public.ai_approvals where id = $1', [id]);
	return row.rows[0];
}

const INTRO = { id: 'b-intro', type: 'heading_1', content: 'Call Me Maybe' };
const NOTES = { id: 'b-notes', type: 'paragraph', content: 'Notes about the song' };

describe('add_blocks: the proposal', () => {
	before(async () => {
		await app.db.query('delete from public.ai_approvals');
		bridge.reset();
	});

	it('resolves `after` to a top-level block, and the card carries its text, not the model words', async () => {
		const pageId = await page([INTRO, NOTES]);
		const answer = await addBlocks.run(CTX, {
			pageId,
			blocks: [{ type: 'paragraph', content: 'Released in 2011.' }],
			after: '  call me   MAYBE'.replace('MAYBE', 'Maybe'),
		});
		assert.ok(answer.ok);
		if (!answer.ok) return;
		assert.equal(answer.data.args.afterBlockId, 'b-intro');
		assert.equal(answer.data.args.afterBlockText, 'Call Me Maybe');
		assert.equal('after' in answer.data.args, false, 'the model words are replaced by the block they named');
		assert.deepEqual(answer.data.preview, { unit: 'blocks', count: 1 });
	});

	it('refuses media and embed block types: text only (C233)', async () => {
		const pageId = await page([INTRO]);
		for (const type of ['image', 'video', 'audio', 'file', 'database_inline', 'layout', 'equation']) {
			const parsed = addBlocks.input.safeParse({ pageId, blocks: [{ type, content: 'https://x.example/a.png' }] });
			assert.equal(parsed.success, false, `${type} is refused by the schema`);
		}
	});

	it('refuses an archived page, a page of someone else, and an ambiguous or nested anchor (C234, C236)', async () => {
		const archived = await page([INTRO], { archived: true });
		const archivedAnswer = await addBlocks.run(CTX, { pageId: archived, blocks: [{ type: 'paragraph', content: 'x' }] });
		assert.deepEqual(archivedAnswer, { ok: false, error: 'that page is archived: restore it first' });

		const foreign = await page([INTRO], { owner: USER_B });
		const foreignAnswer = await addBlocks.run(CTX, { pageId: foreign, blocks: [{ type: 'paragraph', content: 'x' }] });
		assert.equal(foreignAnswer.ok, false, 'a private page of another user is not writable');

		const nested = { id: 'b-toggle', type: 'toggle', content: 'Lyrics', children: [{ id: 'b-deep', type: 'paragraph', content: 'Hey I just met you' }] };
		const pageId = await page([nested, { id: 'b-a', type: 'paragraph', content: 'Verse one' }, { id: 'b-b', type: 'paragraph', content: 'Verse two' }]);
		const deep = await addBlocks.run(CTX, { pageId, blocks: [{ type: 'paragraph', content: 'x' }], after: 'Hey I just met you' });
		assert.equal(deep.ok, false, 'a nested block is not an anchor: the bridge would append at the end');
		const ambiguous = await addBlocks.run(CTX, { pageId, blocks: [{ type: 'paragraph', content: 'x' }], after: 'Verse' });
		assert.equal(ambiguous.ok, false);
		if (!ambiguous.ok) assert.match(ambiguous.error, /several blocks/);
	});

	it('refuses more text than one append carries', async () => {
		const pageId = await page([]);
		const blocks = Array.from({ length: 21 }, () => ({ type: 'paragraph' as const, content: 'x'.repeat(10_000) }));
		const answer = await addBlocks.run(CTX, { pageId, blocks });
		assert.equal(answer.ok, false, `over ${ADD_MAX_BYTES} bytes is refused, never cut`);
	});

	it('anchorOf prefers the exact text over a prefix', () => {
		const blocks = [{ id: 'a', content: 'Verse' }, { id: 'b', content: 'Verse two' }];
		assert.deepEqual(anchorOf(blocks, 'Verse'), { ok: true, id: 'a', text: 'Verse' });
		assert.deepEqual(anchorOf(blocks, 'Verse t'), { ok: true, id: 'b', text: 'Verse two' });
	});
});

describe('add_blocks: the approved write', () => {
	before(async () => {
		await app.db.query('delete from public.ai_approvals');
		bridge.reset();
	});

	it('posts the atomic append with minted ids and the approval id as its key (C226, C235)', async () => {
		bridge.reset();
		const pageId = await page([INTRO, NOTES]);
		const approvalId = await ask({
			pageId,
			blocks: [{ id: 'model-chosen', type: 'paragraph', content: 'Released in 2011.' }],
			after: 'Call Me Maybe',
		});
		const answer = await decide(approvalId);
		assert.equal(answer.status, 200);
		assert.equal((answer.body as { status: string }).status, 'executed');

		const posts = bridge.ofMethod('POST').filter((c) => c.path === `/api/pages/${pageId}/blocks`);
		assert.equal(posts.length, 1, 'one append');
		assert.equal(bridge.ofMethod('PATCH').length, 0, 'no read-modify-write, no PATCH');
		const body = posts[0].body as { blocks: { id: string; type: string; content: string }[]; afterBlockId: string; idempotencyKey: string };
		assert.equal(body.idempotencyKey, approvalId);
		assert.equal(body.afterBlockId, 'b-intro');
		assert.notEqual(body.blocks[0].id, 'model-chosen', 'the id is minted, never the model one');
		assert.match(body.blocks[0].id, /^[0-9a-f-]{36}$/);
		assert.deepEqual(Object.keys(body.blocks[0]).sort(), ['content', 'id', 'type']);

		const stored = bridge.pageContent(pageId);
		assert.deepEqual(stored?.content.map((b) => (b as { id: string }).id), ['b-intro', body.blocks[0].id, 'b-notes']);
		const row = await approvalRow(approvalId);
		assert.equal(row.status, 'executed');
		assert.equal(row.result.version, 4, 'the card can say the version the write produced (C239)');
		assert.equal(row.result.placed, 'after');
		assert.match(row.result.summary, /after the block shown on the card \(page version 4\)/);

		// A reloaded conversation draws the card from the row: it says the same sentence.
		const card = await call(`/api/ai/approvals/${approvalId}`, { method: 'GET', token: tokenFor(USER_A, WORKSPACE_A) });
		assert.equal(card.status, 200);
		assert.equal((card.body as { summary: string }).summary, row.result.summary);
	});

	it('says "at the end" when the block it was to follow is gone since the card', async () => {
		bridge.reset();
		const pageId = await page([INTRO, NOTES]);
		const approvalId = await ask({ pageId, blocks: [{ type: 'paragraph', content: 'Late' }], after: 'Notes about the song' });
		// A human deletes the anchor between the card and the click.
		bridge.seedPage(pageId, [INTRO], 7);
		const answer = await decide(approvalId);
		assert.equal((answer.body as { status: string }).status, 'executed');
		const row = await approvalRow(approvalId);
		assert.equal(row.result.placed, 'end');
		assert.match(row.result.summary, /at the end of the page: the block they were to follow is gone/);
	});

	it('a lost answer is retried with the same key and lands once (C226)', async () => {
		bridge.reset();
		const pageId = await page([INTRO]);
		const approvalId = await ask({ pageId, blocks: [{ type: 'paragraph', content: 'Once' }] });
		bridge.dropNextAppendAnswers(1);
		const answer = await decide(approvalId);
		assert.equal((answer.body as { status: string }).status, 'executed');
		const posts = bridge.ofMethod('POST').filter((c) => c.path === `/api/pages/${pageId}/blocks`);
		assert.equal(posts.length, 2, 'the write was sent twice');
		assert.equal(bridge.pageContent(pageId)?.content.length, 2, 'and landed once');
	});

	it('two lost answers end UNKNOWN, never failed (C238)', async () => {
		bridge.reset();
		const pageId = await page([INTRO]);
		const approvalId = await ask({ pageId, blocks: [{ type: 'paragraph', content: 'Maybe' }] });
		bridge.dropNextAppendAnswers(2);
		const answer = await decide(approvalId);
		assert.equal((answer.body as { status: string }).status, 'unknown');
		const row = await approvalRow(approvalId);
		assert.equal(row.status, 'unknown');
		assert.match(String(row.error), /may have been added/);
	});

	it('an archived page at execution is a refusal, and nothing is written (C234)', async () => {
		bridge.reset();
		const pageId = await page([INTRO]);
		const approvalId = await ask({ pageId, blocks: [{ type: 'paragraph', content: 'x' }] });
		// The page is archived between the card and the click: the bridge answers 404.
		bridge.failWith = 404;
		try {
			const answer = await decide(approvalId);
			assert.equal((answer.body as { status: string }).status, 'failed');
		} finally {
			bridge.failWith = 0;
		}
		assert.equal(bridge.pageContent(pageId)?.content.length, 1, 'nothing landed');
		assert.match(String((await approvalRow(approvalId)).error), /the page is gone/);
	});
});

describe('add_blocks: pure pieces', () => {
	it('bridgeWriteOf rebuilds the body from the stored args only', () => {
		const write = bridgeWriteOf({
			id: '0f0f0f0f-0000-4000-8000-000000000001',
			tool: 'add_blocks',
			args: {
				pageId: '0f0f0f0f-0000-4000-8000-000000000002',
				blocks: [{ type: 'paragraph', content: 'Hi', visibility: 'public' }],
				afterBlockId: 'b-1',
				afterBlockText: 'shown on the card only',
			},
		} as never);
		assert.ok(write);
		assert.equal(write?.path, '/api/pages/0f0f0f0f-0000-4000-8000-000000000002/blocks');
		assert.deepEqual(Object.keys(write?.body ?? {}).sort(), ['afterBlockId', 'blocks', 'idempotencyKey']);
		assert.deepEqual(Object.keys((write?.body.blocks as object[])[0]).sort(), ['content', 'id', 'type']);
	});

	it('appendOutcome reads a long answer whole: a page past 4 000 characters still parses (C229)', () => {
		const write = { method: 'POST' as const, path: '/x', body: { blocks: [{ id: 'new' }], afterBlockId: 'a' } };
		const filler = Array.from({ length: 200 }, (_, i) => ({ id: `f${i}`, content: 'y'.repeat(100) }));
		const body = JSON.stringify({ ok: true, version: 9, content: [{ id: 'a' }, { id: 'new' }, ...filler] });
		assert.ok(body.length > 20_000);
		assert.deepEqual(appendOutcome(write, body), { version: 9, placed: 'after' });
		assert.deepEqual(appendOutcome(write, body.slice(0, 4000)), { version: null, placed: 'unknown' }, 'a cut body is unknown, never guessed');
	});
});

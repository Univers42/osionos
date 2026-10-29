import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { TeiError } from '../src/encoders/tei.ts';
import { createSentimentHandler } from '../src/sentiment/handler.ts';
import type { Job } from '../src/jobs/queue.ts';
import { PAGE_ARCHIVED, PAGE_PUBLIC, WS_PRIVATE, comment, installHooks, logs, mock, pool, ready, sentimentReady, sha, signal } from './moderationHarness.ts';

/** The sentiment handler (M6): C138, C139, C142, C148. */

installHooks();

const MODEL = 'cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual';
const REVISION = '82107f4ccba672c9ab1eee538e727e462cad21de';

const handler = () =>
	createSentimentHandler({ pool, teiUrl: mock.baseUrl, model: MODEL, revision: REVISION, log: (entry) => logs.push(entry) });

const sentimentJob = (id: string, content: string, subjectKind = 'page_comment'): Job => ({
	kind: 'sentiment',
	subjectKind,
	subjectId: id,
	workspaceId: WS_PRIVATE,
	priority: 5,
	attempts: 0,
	enqueuedAt: new Date().toISOString(),
	contentSha256: sha(content),
});

const optIn = (enabled = true) =>
	pool.query(
		`insert into public.ai_sentiment_settings (workspace_id, enabled) values ($1, $2)
		 on conflict (workspace_id) do update set enabled = excluded.enabled`,
		[WS_PRIVATE, enabled],
	);

const scores = async (id: string) =>
	(await pool.query('select * from public.ai_sentiment where subject_id = $1', [id])).rows;

const labelsOf = (negative: string, neutral: string, positive: string, scoreOf: [number, number, number]) => () =>
	[
		{ label: negative, score: scoreOf[0] },
		{ label: neutral, score: scoreOf[1] },
		{ label: positive, score: scoreOf[2] },
	];

describe('the sentiment handler', { timeout: 60_000, skip: ready && sentimentReady ? false : 'the sentiment migration was not applied' }, () => {
	afterEach(async () => {
		// Turning the switch off deletes the scores of the workspace (C143).
		await pool.query('delete from public.ai_sentiment_settings where workspace_id = $1', [WS_PRIVATE]);
	});

	it('C142 enabled workspace: the comment gets the argmax label and its score as confidence', async () => {
		await optIn();
		const content = 'what a lovely page';
		const id = await comment('page_comment', content);
		mock.setOptions({ labels: labelsOf('negative', 'neutral', 'positive', [0.1, 0.2, 0.7]) });
		await handler()(sentimentJob(id, content), signal);
		const [row] = await scores(id);
		assert.equal(row.label, 'positive');
		assert.ok(Math.abs(row.confidence - 0.7) < 1e-6);
		assert.equal(row.workspace_id, WS_PRIVATE);
		assert.equal(row.model, MODEL);
		assert.equal(row.revision, REVISION);
		assert.equal(row.content_sha256, sha(content));
		assert.ok(!('author_id' in row), 'C140: the table has no author column');
	});

	it('C142 stale: the content changes while the classifier works, nothing is written', async () => {
		await optIn();
		const content = 'first words';
		const id = await comment('page_comment', content);
		mock.setOptions({
			labels: labelsOf('negative', 'neutral', 'positive', [0.1, 0.2, 0.7]),
			onRequest: async () => {
				await pool.query('update public.osionos_page_comments set content = $2 where id = $1', [id, 'second words']);
			},
		});
		await handler()(sentimentJob(id, content), signal);
		assert.equal((await scores(id)).length, 0);
		assert.ok(logs.some((entry) => entry.event === 'sentiment_stale'));
	});

	it('C138 disabled workspace: no row, no classifier call', async () => {
		const content = 'quiet words';
		const id = await comment('page_comment', content);
		const calls = mock.bodies.length;
		await handler()(sentimentJob(id, content), signal);
		assert.equal((await scores(id)).length, 0);
		await optIn(false);
		await handler()(sentimentJob(id, content), signal);
		assert.equal((await scores(id)).length, 0);
		assert.equal(mock.bodies.length, calls);
	});

	it('C138 archived page: no row', async () => {
		await optIn();
		const content = 'archived words';
		const id = await comment('page_comment', content, PAGE_ARCHIVED);
		await handler()(sentimentJob(id, content), signal);
		assert.equal((await scores(id)).length, 0);
	});

	it('C148 LABEL_n: the ids map to negative, neutral, positive', async () => {
		await optIn();
		const content = 'plain words';
		const id = await comment('page_comment', content, PAGE_PUBLIC);
		mock.setOptions({ labels: labelsOf('LABEL_0', 'LABEL_1', 'LABEL_2', [0.8, 0.1, 0.1]) });
		await handler()(sentimentJob(id, content), signal);
		assert.equal((await scores(id))[0].label, 'negative');
		mock.setOptions({ labels: labelsOf('LABEL_0', 'LABEL_1', 'LABEL_2', [0.1, 0.8, 0.1]) });
		await handler()(sentimentJob(id, content), signal);
		assert.equal((await scores(id))[0].label, 'neutral');
		mock.setOptions({ labels: labelsOf('Label_0', 'Label_1', 'Label_2', [0.1, 0.1, 0.8]) });
		await handler()(sentimentJob(id, content), signal);
		assert.equal((await scores(id))[0].label, 'positive');
	});

	it('C148 unknown labels: toxic/non-toxic throws a shape TeiError and writes nothing', async () => {
		await optIn();
		const content = 'other model words';
		const id = await comment('page_comment', content);
		mock.setOptions({ labels: () => [{ label: 'toxic', score: 0.6 }, { label: 'non-toxic', score: 0.4 }] });
		await assert.rejects(handler()(sentimentJob(id, content), signal), (error: unknown) => {
			assert.ok(error instanceof TeiError);
			assert.equal((error as TeiError).kind, 'shape');
			assert.ok(!(error as Error).message.includes(content));
			return true;
		});
		assert.equal((await scores(id)).length, 0);
	});

	it('C139 other subject kind: a message job writes nothing and calls nothing', async () => {
		await optIn();
		const content = 'chat words';
		const id = await comment('page_comment', content);
		const calls = mock.bodies.length;
		await handler()(sentimentJob(id, content, 'message'), signal);
		await handler()(sentimentJob('not-a-uuid', content), signal);
		assert.equal((await scores(id)).length, 0);
		assert.equal(mock.bodies.length, calls);
		assert.ok(logs.some((entry) => entry.event === 'sentiment_skip' && entry.reason === 'subject_kind'));
	});
});

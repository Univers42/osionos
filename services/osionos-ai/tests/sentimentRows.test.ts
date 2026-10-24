import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { createSentimentHandler } from '../src/sentiment/handler.ts';
import type { Job } from '../src/jobs/queue.ts';
import { AUTHOR, WS_PRIVATE, installHooks, mock, pool, ready, sentimentReady, sha, signal } from './moderationHarness.ts';
import { serveAi, tokenFor } from './serveAi.ts';

/**
 * The object-database row projection (M6p-1): the trigger that rebuilds it from
 * the saved state, the job branch that scores it, and the owner-only read
 * route. C138, C141, C142, C143, C150-C155.
 */

installHooks();

const objectTables = await pool.query(
	"select to_regclass('public.osionos_object_databases') as databases, to_regclass('public.osionos_object_database_rows') as rows",
);
const rowsReady = Boolean(objectTables.rows[0]?.databases) && Boolean(objectTables.rows[0]?.rows);
const canRun = ready && sentimentReady && rowsReady;

const base = await serveAi();

const DB_KEY = 'db-rows-test';
const TITLE_ID = 'prop-title';
const TEXT_ID = 'prop-text';
const AI_ID = 'prop-ai';
const MODEL = 'cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual';
const REVISION = '82107f4ccba672c9ab1eee538e727e462cad21de';

const VIEWER = randomUUID();
const STRANGER = randomUUID();

type PageSpec = {
	id: string;
	title: string;
	text: string;
	archived?: boolean;
	isTemplate?: boolean;
};

type State = {
	databases: Record<string, unknown>;
	pages: Record<string, unknown>;
	views: Record<string, unknown>;
};

function state(pages: PageSpec[], ai = true, pagesOverride?: unknown): State {
	const properties: Record<string, unknown> = {
		[TITLE_ID]: { id: TITLE_ID, name: 'Title', type: 'title' },
		[TEXT_ID]: { id: TEXT_ID, name: 'Text', type: 'text' },
	};
	if (ai) {
		properties[AI_ID] = {
			id: AI_ID,
			name: 'Sentiment',
			type: 'select',
			options: [
				{ id: 'negative', value: 'negative', color: 'red' },
				{ id: 'neutral', value: 'neutral', color: 'gray' },
				{ id: 'positive', value: 'positive', color: 'green' },
			],
			autofill: { kind: 'sentiment', sourcePropertyIds: [TITLE_ID, TEXT_ID] },
		};
	}
	const pageMap: Record<string, unknown> = {};
	if (pagesOverride === undefined) {
		for (const page of pages) {
			pageMap[page.id] = {
				id: page.id,
				databaseId: DB_KEY,
				properties: { [TITLE_ID]: page.title, [TEXT_ID]: page.text },
				content: [],
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				createdBy: 'You',
				lastEditedBy: 'You',
				...(page.archived ? { archived: true } : {}),
				...(page.isTemplate ? { isTemplate: true } : {}),
			};
		}
	}
	return {
		databases: {
			[DB_KEY]: {
				id: DB_KEY,
				name: 'Feedback',
				properties,
				titlePropertyId: TITLE_ID,
			},
		},
		pages: (pagesOverride === undefined ? pageMap : pagesOverride) as Record<string, unknown>,
		views: {},
	};
}

const PAGES: PageSpec[] = [
	{ id: 'row-1', title: 'First title', text: 'First body' },
	{ id: 'row-2', title: 'Second title', text: 'Second body' },
	{ id: 'row-3', title: '', text: 'Only body' },
];

const textOf = (page: PageSpec): string => `${page.title}\n${page.text}`.trim();

async function save(value: State): Promise<void> {
	await pool.query(
		`insert into public.osionos_object_databases (owner_id, db_key, workspace_id, title, state)
		 values ($1, $2, $3, 'Feedback', $4)
		 on conflict (owner_id, db_key) do update
		   set state = excluded.state, workspace_id = excluded.workspace_id, updated_at = now()`,
		[AUTHOR, DB_KEY, WS_PRIVATE, value],
	);
}

async function dropDatabase(): Promise<void> {
	await pool.query('delete from public.osionos_object_databases where owner_id = $1 and db_key = $2', [AUTHOR, DB_KEY]);
}

const optIn = (enabled = true) =>
	pool.query(
		`insert into public.ai_sentiment_settings (workspace_id, enabled) values ($1, $2)
		 on conflict (workspace_id) do update set enabled = excluded.enabled`,
		[WS_PRIVATE, enabled],
	);

type ProjectionRow = {
	id: string;
	row_id: string;
	property_id: string;
	scored_text: string;
	content_sha256: string;
	updated_at: Date;
};

const projection = async (): Promise<ProjectionRow[]> =>
	(
		await pool.query<ProjectionRow>(
			`select id, row_id, property_id, scored_text, content_sha256, updated_at
			   from public.osionos_object_database_rows
			  where owner_id = $1 and db_key = $2
			  order by row_id, property_id`,
			[AUTHOR, DB_KEY],
		)
	).rows;

type JobRow = { subject_id: string; content_sha256: string | null; enqueued_at: Date };

const jobs = async (): Promise<JobRow[]> =>
	(
		await pool.query<JobRow>(
			`select subject_id, content_sha256, enqueued_at
			   from public.ai_jobs
			  where kind = 'sentiment' and subject_kind = 'database_row' and workspace_id = $1
			  order by subject_id`,
			[WS_PRIVATE],
		)
	).rows;

const scoreRow = (row: ProjectionRow, label: string, contentSha = row.content_sha256) =>
	pool.query(
		`insert into public.ai_sentiment (subject_kind, subject_id, workspace_id, label, confidence, model, content_sha256)
		 values ('database_row', $1, $2, $3, 0.9, 'test', $4)
		 on conflict (subject_kind, subject_id) do update
		   set label = excluded.label, content_sha256 = excluded.content_sha256, scored_at = now()`,
		[row.id, WS_PRIVATE, label, contentSha],
	);

const scoreFor = async (id: string) =>
	(await pool.query('select * from public.ai_sentiment where subject_kind = $1 and subject_id = $2', ['database_row', id])).rows;

const get = async (token: string | null, path: string) => {
	const response = await fetch(`${base}${path}`, {
		headers: token ? { authorization: `Bearer ${token}` } : {},
	});
	const text = await response.text();
	return {
		status: response.status,
		text,
		body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
		cacheControl: response.headers.get('cache-control'),
	};
};

const rowsPath = (databaseId = DB_KEY, propertyId = AI_ID): string =>
	`/api/ai/sentiment/rows?databaseId=${encodeURIComponent(databaseId)}&propertyId=${encodeURIComponent(propertyId)}`;

const handler = () =>
	createSentimentHandler({
		pool,
		teiUrl: mock.baseUrl,
		model: MODEL,
		revision: REVISION,
		log: () => undefined,
	});

const sentimentJob = (id: string, contentSha256: string | null): Job => ({
	kind: 'sentiment',
	subjectKind: 'database_row',
	subjectId: id,
	workspaceId: WS_PRIVATE,
	priority: 5,
	attempts: 0,
	enqueuedAt: new Date().toISOString(),
	contentSha256,
});

const median = (values: number[]): number => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

describe('the object-database row projection', { timeout: 180_000, skip: canRun ? false : 'the rows migration was not applied' }, () => {
	before(async () => {
		await pool.query(
			`insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions) values
			 ($1, $2, 'owner', array['read']), ($1, $3, 'viewer', array['read'])
			 on conflict (workspace_id, user_id) do nothing`,
			[WS_PRIVATE, AUTHOR, VIEWER],
		);
	});

	beforeEach(async () => {
		await dropDatabase();
		await pool.query('delete from public.ai_sentiment_settings where workspace_id = $1', [WS_PRIVATE]);
		await pool.query('delete from public.ai_sentiment where workspace_id = $1', [WS_PRIVATE]);
		await pool.query('delete from public.ai_jobs where workspace_id = $1', [WS_PRIVATE]);
	});

	afterEach(async () => {
		await dropDatabase();
		await pool.query('delete from public.ai_sentiment_settings where workspace_id = $1', [WS_PRIVATE]);
		await pool.query('delete from public.ai_sentiment where workspace_id = $1', [WS_PRIVATE]);
		await pool.query('delete from public.ai_jobs where workspace_id = $1', [WS_PRIVATE]);
	});

	after(async () => {
		await pool.query('delete from public.osionos_workspace_members where workspace_id = $1', [WS_PRIVATE]);
	});

	it('C152 insert: one projection row per page, the chosen text and its sha; one job per row only when enabled', async () => {
		await optIn(true);
		await save(state(PAGES));

		const rows = await projection();
		assert.equal(rows.length, 3);
		assert.deepEqual(
			rows.map((row) => [row.row_id, row.property_id, row.scored_text, row.content_sha256]),
			PAGES.map((page) => [page.id, AI_ID, textOf(page), sha(textOf(page))]),
		);

		const enqueued = await jobs();
		assert.equal(enqueued.length, 3);
		assert.deepEqual(
			enqueued.map((job) => job.subject_id).sort(),
			rows.map((row) => row.id).sort(),
		);
		assert.ok(enqueued.every((job) => job.content_sha256 !== null));

		// Off: the projection is still maintained, but nothing is queued.
		await optIn(false);
		assert.equal((await jobs()).length, 0);
		await save(state(PAGES));
		assert.equal((await projection()).length, 3);
		assert.equal((await jobs()).length, 0);
	});

	it('C152 no-op save: no projection update, no job; one edited page updates one row and one job', async () => {
		await optIn(true);
		await save(state(PAGES));
		const beforeRows = await projection();
		const beforeJobs = await jobs();
		assert.equal(beforeRows.length, 3);
		assert.equal(beforeJobs.length, 3);

		await new Promise((resolve) => setTimeout(resolve, 20));
		await save(state(PAGES));
		const noopRows = await projection();
		const noopJobs = await jobs();
		assert.deepEqual(
			noopRows.map((row) => row.updated_at.toISOString()),
			beforeRows.map((row) => row.updated_at.toISOString()),
		);
		assert.deepEqual(noopJobs, beforeJobs);

		const edited = PAGES.map((page) => (page.id === 'row-1' ? { ...page, text: 'First body, edited' } : page));
		await new Promise((resolve) => setTimeout(resolve, 20));
		await save(state(edited));

		const afterRows = await projection();
		const changedRows = afterRows.filter((row) => {
			const old = beforeRows.find((candidate) => candidate.id === row.id);
			return !old || old.content_sha256 !== row.content_sha256;
		});
		assert.equal(changedRows.length, 1);
		assert.equal(changedRows[0].row_id, 'row-1');
		assert.equal(changedRows[0].scored_text, 'First title\nFirst body, edited');

		const afterJobs = await jobs();
		assert.equal(afterJobs.length, 3);
		const changedJobs = afterJobs.filter((job) => {
			const old = beforeJobs.find((candidate) => candidate.subject_id === job.subject_id);
			return !old || old.content_sha256 !== job.content_sha256;
		});
		assert.equal(changedJobs.length, 1);
		assert.equal(changedJobs[0].content_sha256, sha('First title\nFirst body, edited'));
		assert.equal(changedJobs[0].subject_id, changedRows[0].id);
	});

	it('C152/C143 a removed page takes its projection and its score; a removed database takes them all', async () => {
		await optIn(true);
		await save(state(PAGES));
		const rows = await projection();
		for (const [index, row] of rows.entries()) await scoreRow(row, ['negative', 'neutral', 'positive'][index]);
		assert.equal(rows.length, 3);

		await save(state(PAGES.filter((page) => page.id !== 'row-1')));
		const kept = await projection();
		assert.deepEqual(
			kept.map((row) => row.row_id).sort(),
			['row-2', 'row-3'],
		);
		assert.equal((await scoreFor(rows.find((row) => row.row_id === 'row-1')!.id)).length, 0);
		assert.equal((await scoreFor(rows.find((row) => row.row_id === 'row-2')!.id)).length, 1);

		const ids = kept.map((row) => row.id);
		await dropDatabase();
		assert.equal((await projection()).length, 0);
		const left = await pool.query(
			`select 1 from public.ai_sentiment where subject_kind = 'database_row' and subject_id = any($1::text[])`,
			[ids],
		);
		assert.equal(left.rowCount, 0);
	});

	it('C143 with the jobs off, a removed page still takes its projection and its score', async () => {
		await optIn(true);
		await save(state(PAGES));
		const rows = await projection();
		for (const row of rows) await scoreRow(row, 'neutral');
		const gone = rows.find((row) => row.row_id === 'row-1')!;

		const client = await pool.connect();
		try {
			await client.query('begin');
			await client.query("set local osionos.ai_jobs = 'off'");
			await client.query(
				'update public.osionos_object_databases set state = $3 where owner_id = $1 and db_key = $2',
				[AUTHOR, DB_KEY, state(PAGES.filter((page) => page.id !== 'row-1'))],
			);
			await client.query('commit');
		} finally {
			client.release();
		}
		assert.deepEqual((await projection()).map((row) => row.row_id).sort(), ['row-2', 'row-3']);
		assert.equal((await scoreFor(gone.id)).length, 0);
	});

	it('C150 early exit: a state with no AI property projects nothing; removing the property deletes the projection', async () => {
		await save(state(PAGES, false));
		assert.equal((await projection()).length, 0);

		await save(state(PAGES, true));
		assert.equal((await projection()).length, 3);

		await save(state(PAGES, false));
		assert.equal((await projection()).length, 0);
	});

	it('C151 never fails the save: a pages value that is not an object is stored', async () => {
		await save(state(PAGES, true));
		assert.equal((await projection()).length, 3);

		await save(state(PAGES, true, 'not-an-object'));
		const stored = await pool.query<{ pages: string }>(
			`select state ->> 'pages' as pages from public.osionos_object_databases
			  where owner_id = $1 and db_key = $2`,
			[AUTHOR, DB_KEY],
		);
		assert.equal(stored.rows[0]?.pages, 'not-an-object');
	});

	it('C142 handler: a fresh sha lands, a text edited after enqueue does not', async () => {
		await optIn(true);
		await save(state(PAGES));
		const rows = await projection();
		const fresh = rows.find((row) => row.row_id === 'row-1')!;
		const stale = rows.find((row) => row.row_id === 'row-2')!;

		mock.setOptions({
			labels: () => [
				{ label: 'negative', score: 0.1 },
				{ label: 'neutral', score: 0.2 },
				{ label: 'positive', score: 0.7 },
			],
		});
		await handler()(sentimentJob(fresh.id, fresh.content_sha256), signal);
		const scored = await scoreFor(fresh.id);
		assert.equal(scored.length, 1);
		assert.equal(scored[0].label, 'positive');
		assert.equal(scored[0].content_sha256, sha(fresh.scored_text));

		const staleSha = stale.content_sha256;
		mock.setOptions({
			labels: () => [
				{ label: 'negative', score: 0.8 },
				{ label: 'neutral', score: 0.1 },
				{ label: 'positive', score: 0.1 },
			],
		});
		const edited = PAGES.map((page) => (page.id === 'row-2' ? { ...page, text: 'Second body, edited later' } : page));
		await save(state(edited));
		await handler()(sentimentJob(stale.id, staleSha), signal);
		assert.equal((await scoreFor(stale.id)).length, 0);
	});

	it('C154 route: owner-only labels, byte-identical empty answers, stale absent, 400/401, private no-store', async () => {
		await optIn(true);
		await save(state(PAGES));
		const rows = await projection();
		const first = rows.find((row) => row.row_id === 'row-1')!;
		const second = rows.find((row) => row.row_id === 'row-2')!;
		const third = rows.find((row) => row.row_id === 'row-3')!;
		await scoreRow(first, 'positive');
		await scoreRow(second, 'negative');
		await scoreRow(third, 'neutral', sha('a text that is no longer the projection'));

		const owner = await get(tokenFor(AUTHOR), rowsPath());
		assert.equal(owner.status, 200);
		assert.deepEqual(owner.body, { 'row-1': 'positive', 'row-2': 'negative' });
		assert.equal(owner.cacheControl, 'private, no-store');
		assert.deepEqual(Object.keys(owner.body ?? {}).sort(), ['row-1', 'row-2']);

		const member = await get(tokenFor(VIEWER), rowsPath());
		assert.equal(member.status, 200);
		assert.equal(member.text, '{}');

		const stranger = await get(tokenFor(STRANGER), rowsPath());
		const unknown = await get(tokenFor(STRANGER), rowsPath('db-does-not-exist'));
		assert.equal(stranger.status, 200);
		assert.equal(stranger.text, '{}');
		assert.equal(stranger.text, unknown.text);

		await optIn(false);
		const off = await get(tokenFor(AUTHOR), rowsPath());
		assert.equal(off.text, '{}');

		assert.equal((await get(tokenFor(AUTHOR), '/api/ai/sentiment/rows?propertyId=prop-ai')).status, 400);
		assert.equal((await get(tokenFor(AUTHOR), '/api/ai/sentiment/rows?databaseId=db-rows-test')).status, 400);
		assert.equal((await get(tokenFor(AUTHOR), rowsPath('d'.repeat(129)))).status, 400);
		assert.equal((await get(tokenFor(AUTHOR), rowsPath(DB_KEY, 'p'.repeat(81)))).status, 400);
		assert.equal((await get(null, rowsPath())).status, 401);
	});

	it('C143 off and erase: the switch deletes the row scores; erasing the owner deletes them too', async () => {
		await optIn(true);
		await save(state(PAGES));
		const rows = await projection();
		for (const [index, row] of rows.entries()) await scoreRow(row, ['negative', 'neutral', 'positive'][index]);
		assert.equal(
			(await pool.query(`select 1 from public.ai_sentiment where workspace_id = $1 and subject_kind = 'database_row'`, [WS_PRIVATE]))
				.rowCount,
			3,
		);

		await optIn(false);
		assert.equal(
			(await pool.query(`select 1 from public.ai_sentiment where workspace_id = $1 and subject_kind = 'database_row'`, [WS_PRIVATE]))
				.rowCount,
			0,
		);

		await optIn(true);
		for (const [index, row] of rows.entries()) await scoreRow(row, ['negative', 'neutral', 'positive'][index]);
		const erased = await pool.query<{ n: number }>('select public.ai_sentiment_erase_user($1) as n', [AUTHOR]);
		assert.ok((erased.rows[0]?.n ?? 0) >= 3);
		assert.equal(
			(await pool.query(`select 1 from public.ai_sentiment where workspace_id = $1 and subject_kind = 'database_row'`, [WS_PRIVATE]))
				.rowCount,
			0,
		);
	});

	it('C150 cost: 50 updates of a 500-page state, with and without an AI property', async (t) => {
		const big: PageSpec[] = Array.from({ length: 500 }, (_, index) => ({
			id: `row-${index}`,
			title: `Title ${index}`,
			text: `Body of page ${index} with enough words to be a real text.`,
		}));

		const without: number[] = [];
		await save(state(big, false));
		for (let index = 0; index < 50; index += 1) {
			const started = performance.now();
			await save(state(big, false));
			without.push(performance.now() - started);
		}

		await dropDatabase();
		const withAi: number[] = [];
		await save(state(big, true));
		for (let index = 0; index < 50; index += 1) {
			const started = performance.now();
			await save(state(big, true));
			withAi.push(performance.now() - started);
		}

		t.diagnostic(`C150 500-page state, 50 UPDATEs: without AI property median ${median(without).toFixed(1)} ms; with AI property median ${median(withAi).toFixed(1)} ms`);
		assert.equal((await projection()).length, 500);
	});
});

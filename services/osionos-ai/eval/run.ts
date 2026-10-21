/* ************************************************************************** */
/*                                                                            */
/*   run.ts                                            the golden-set runner   */
/*                                                                            */
/*   Measures the retrieval of the service (src/retrieval/search.ts) on the   */
/*   golden set (eval/golden.jsonl) with the REAL embedder (a local TEI):    */
/*                                                                            */
/*     - recall@5: the share of the expected pages the answer holds;         */
/*     - MRR: the rank of the first expected page;                            */
/*     - leaks: a page the asker may not read, or an archived one. They must */
/*       be ZERO — a leak ends the run with exit 1;                           */
/*     - the top fused score of the negative questions, so a reader can see  */
/*       whether a threshold could separate them (no threshold is added);    */
/*     - the latency of retrieve(): p50 and p95, the embedding included.      */
/*                                                                            */
/*   It measures. It never tunes: the retrieval is the one of the service,   */
/*   the corpus is the one of the golden set, and nothing is changed to make  */
/*   a number better.                                                        */
/*                                                                            */
/*   The environment:                                                        */
/*     OSIONOS_AI_DATABASE_URL  the database of the stack                     */
/*     OSIONOS_AI_EMBED_URL     the embedding service (the local TEI)        */
/*     OSIONOS_AI_EMBED_MODEL   the model the service loads                  */
/*     AI_EVAL_RESULTS_FILE     the file of the report (RESULTS.md)          */
/*     AI_EVAL_SKIP_ACL_FILTER  the bite of the leak check (see below)      */
/*                                                                            */
/*   No dependencies beyond the service's own. Node 22.                       */
/* ************************************************************************** */

import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import type { AuthUser } from '../src/auth.ts';
import { Embedder } from '../src/indexer/embedder.ts';
import { IndexerWorker } from '../src/indexer/worker.ts';
import { liveMemberWorkspaces } from '../src/retrieval/acl.ts';
import { retrieve } from '../src/retrieval/search.ts';
import { canReadPageRowAsMember } from '../../../scripts/bridge-page-read.mjs';
import { USER_IDS, WORKSPACE_ID, pageId, readCorpus, readGolden } from './lib.mjs';

const execFileAsync = promisify(execFile);

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));

// The user ids of the golden set, by their key (u_ana, u_ben, u_chloe).
const USER_ID_BY_KEY = USER_IDS as Record<string, string>;

/** One question of the golden set. */
interface GoldenQuestion {
	id: string;
	q: string;
	lang: string;
	kind: string;
	asker: string;
	expected: string[];
}

/** One page of the corpus, as the database holds it. */
interface PageRow extends QueryResultRow {
	id: string;
	workspace_id: string;
	owner_id: string | null;
	visibility: string | null;
	collaborators: unknown;
	title: string | null;
	archived_at: Date | null;
}

/** What one question answered. */
interface QuestionResult {
	id: string;
	kind: string;
	asker: string;
	question: string;
	expected: string[];
	/** The pages of the answer, in the order of the fusion. */
	returned: string[];
	/** The number of chunks the answer holds (a page may take three of them). */
	chunks: number;
	/** The share of the expected pages the answer holds; null when there is none. */
	recall: number | null;
	/** The rank of the first expected page; zero when there is none. */
	rank: number;
	/** The pages the asker may not read, or that are archived. */
	leaks: { page: string; reason: string }[];
	/** The milliseconds retrieve() took, the embedding included. */
	latencyMs: number;
	/** The score of the best chunk; null when the answer is empty. */
	topScore: number | null;
	/** The title of the best chunk. */
	topTitle: string | null;
}

/** The environment of the run. */
const databaseUrl = process.env.OSIONOS_AI_DATABASE_URL ?? '';
const embedUrl = process.env.OSIONOS_AI_EMBED_URL ?? '';
const embedModel = process.env.OSIONOS_AI_EMBED_MODEL ?? 'intfloat/multilingual-e5-small';
const resultsFile = process.env.AI_EVAL_RESULTS_FILE ?? 'RESULTS.md';
/**
 * The bite of the leak check: the acl questions whose answer the asker may
 * NOT read are retrieved as the OWNER of the page that answers them, and
 * scored as the asker. The leak check must catch them. It is off by default,
 * and the default is the behaviour that is measured.
 */
const skipAclFilter = (process.env.AI_EVAL_SKIP_ACL_FILTER ?? '').trim() === '1';
/** How long the indexer may take to empty the queue. */
const indexTimeoutMs = Number(process.env.AI_EVAL_INDEX_TIMEOUT_MS ?? 600_000);

if (databaseUrl.length === 0 || embedUrl.length === 0) {
	console.error('[eval] refusing to start: OSIONOS_AI_DATABASE_URL and OSIONOS_AI_EMBED_URL are needed');
	process.exit(2);
}

// ---------------------------------------------------------------------------
// The data of the golden set
// ---------------------------------------------------------------------------

const questions: GoldenQuestion[] = (readGolden() as GoldenQuestion[]).map((question) => ({
	id: String(question.id),
	q: String(question.q),
	lang: String(question.lang),
	kind: String(question.kind),
	asker: String(question.asker),
	expected: Array.isArray(question.expected) ? question.expected.map((slug) => String(slug)) : [],
}));

/** The corpus: the titles of the pages, and the owner of the answer of a question. */
const corpus = readCorpus();
/** The front matter of a page, as the map it is. */
const metaOf = (page: (typeof corpus)[number]): Record<string, unknown> =>
	page.meta as Record<string, unknown>;
const titleBySlug = new Map(corpus.map((page) => [page.slug, String(metaOf(page).title ?? '')]));
const slugByPageId = new Map(corpus.map((page) => [pageId(page.slug).toLowerCase(), page.slug]));
/**
 * The owner of the page that answers a question: the corpus carries the answer
 * markers, so the page of a question id is the one that marks it.
 */
const ownerByQuestion = new Map<string, string>();
for (const page of corpus) {
	for (const marker of page.markers) {
		for (const id of marker.ids) {
			if (!ownerByQuestion.has(id)) ownerByQuestion.set(id, String(metaOf(page).owner));
		}
	}
}

/** The user of a question: a member of the one workspace of the golden set. */
function authUser(key: string): AuthUser {
	return {
		userId: USER_ID_BY_KEY[key] ?? '',
		workspaceId: WORKSPACE_ID,
		memberWorkspaces: [],
		isAdmin: false,
	};
}

// ---------------------------------------------------------------------------
// The helpers
// ---------------------------------------------------------------------------

/** The sleep of a millisecond. */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The percentile of a sorted list, nearest rank. */
function percentile(sorted: readonly number[], fraction: number): number {
	if (sorted.length === 0) return 0;
	const rank = Math.max(1, Math.ceil(fraction * sorted.length));
	return sorted[rank - 1] ?? 0;
}

/** A mean, with three decimals. */
function mean(values: readonly number[]): number {
	if (values.length === 0) return 0;
	const sum = values.reduce((total, value) => total + value, 0);
	return sum / values.length;
}

/** A share, with two decimals. */
function share(value: number): string {
	return value.toFixed(2);
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const db = new Pool({
	connectionString: databaseUrl,
	max: 4,
	statement_timeout: 30_000,
	application_name: 'osionos-ai-eval',
});

/** The seed of the golden set: the SQL of eval/seed.mjs, applied. */
async function applySeed(): Promise<void> {
	const { stdout } = await execFileAsync(process.execPath, [path.join(EVAL_DIR, 'seed.mjs')], {
		maxBuffer: 64 * 1024 * 1024,
	});
	await db.query(stdout);
	const pages = await db.query<{ n: number }>('select count(*)::int as n from public.osionos_pages');
	console.log(`[eval] the seed wrote ${pages.rows[0]?.n ?? 0} pages`);
}

/** The three users of the golden set are members of the one workspace. */
async function addMembers(): Promise<void> {
	for (const key of Object.keys(USER_ID_BY_KEY)) {
		await db.query(
			`insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions)
			 values ($1, $2, 'member', array['read'])
			 on conflict (workspace_id, user_id) do nothing`,
			[WORKSPACE_ID, USER_ID_BY_KEY[key]],
		);
	}
	console.log(`[eval] ${Object.keys(USER_ID_BY_KEY).length} users are members of the workspace`);
}

/** The indexer, until the queue is empty. */
async function indexCorpus(): Promise<{
	ms: number;
	workMs: number;
	pages: number;
	chunks: number;
	embedded: number;
}> {
	const embedder = new Embedder({ baseUrl: embedUrl, model: embedModel });
	const done: { chunks: number; embedded: number; ms: number }[] = [];
	const worker = new IndexerWorker({
		pool: db,
		embedder,
		databaseUrl,
		log: (entry) => {
			if (String(entry.event ?? '') === 'indexed') {
				done.push({
					chunks: Number(entry.chunks ?? 0),
					embedded: Number(entry.embedded ?? 0),
					ms: Number(entry.ms ?? 0),
				});
				return;
			}
			console.log(JSON.stringify(entry));
		},
	});
	await worker.start();
	const started = Date.now();
	try {
		for (;;) {
			const pending = await db.query<{ n: number }>('select count(*)::int as n from public.ai_index_queue');
			const left = pending.rows[0]?.n ?? 0;
			if (left === 0) break;
			if (Date.now() - started > indexTimeoutMs) {
				throw new Error(`the indexer did not empty the queue in ${indexTimeoutMs} ms (${left} pages left)`);
			}
			await sleep(500);
		}
	} finally {
		await worker.stop();
	}
	const chunks = done.reduce((total, page) => total + page.chunks, 0);
	const embedded = done.reduce((total, page) => total + page.embedded, 0);
	const workMs = done.reduce((total, page) => total + page.ms, 0);
	return { ms: Date.now() - started, workMs, pages: done.length, chunks, embedded };
}

/** The pages of the corpus, as the database holds them. */
async function readPages(): Promise<Map<string, PageRow>> {
	const result = await db.query<PageRow>(
		`select id, workspace_id, owner_id, visibility, collaborators, title, archived_at
		   from public.osionos_pages`,
	);
	return new Map(result.rows.map((row) => [String(row.id).toLowerCase(), row]));
}

/** The user the retrieval runs as. */
function retrievalUser(question: GoldenQuestion): AuthUser {
	if (!skipAclFilter) return authUser(question.asker);
	if (question.kind !== 'acl' || question.expected.length > 0) return authUser(question.asker);
	// The bite: the owner of the page that answers the question retrieves it,
	// and the asker of the question scores it.
	const owner = ownerByQuestion.get(question.id);
	return owner ? authUser(owner) : authUser(question.asker);
}

/** One question, asked. */
async function ask(
	question: GoldenQuestion,
	pages: Map<string, PageRow>,
	workspaces: readonly string[],
): Promise<QuestionResult> {
	const asker = authUser(question.asker);
	const begin = performance.now();
	const chunks = await retrieve(db, retrievalUser(question), { query: question.q, limit: 5 });
	const latencyMs = performance.now() - begin;
	const returned: string[] = [];
	for (const chunk of chunks) {
		const id = String(chunk.pageId).toLowerCase();
		if (!returned.includes(id)) returned.push(id);
	}

	// The leak check: every page of the answer must be readable by the asker,
	// under the bridge's own rule, and it must not be archived.
	const leaks: { page: string; reason: string }[] = [];
	for (const id of returned) {
		const row = pages.get(id);
		if (!row) {
			leaks.push({ page: slugByPageId.get(id) ?? id, reason: 'the page is not in the database' });
			continue;
		}
		if (row.archived_at) {
			leaks.push({ page: slugByPageId.get(id) ?? id, reason: 'the page is archived' });
			continue;
		}
		if (!canReadPageRowAsMember(row, asker.userId, workspaces)) {
			leaks.push({ page: slugByPageId.get(id) ?? id, reason: 'the asker may not read the page' });
		}
	}

	// The expected pages, and the rank of the first one of them. The rank is
	// the rank of the PAGE in the answer (the answer is a list of pages: a
	// page may take three chunks of the five), so the MRR and the recall read
	// the same list.
	const expected = question.expected.map((slug) => pageId(slug).toLowerCase());
	const found = expected.filter((id) => returned.includes(id));
	const rank = returned.findIndex((id) => expected.includes(id)) + 1;

	return {
		id: question.id,
		kind: question.kind,
		asker: question.asker,
		question: question.q,
		expected: question.expected,
		returned: returned.map((id) => slugByPageId.get(id) ?? id),
		chunks: chunks.length,
		recall: expected.length === 0 ? null : found.length / expected.length,
		rank,
		leaks,
		latencyMs,
		topScore: chunks.length > 0 ? Number(chunks[0]?.score ?? 0) : null,
		topTitle: chunks.length > 0 ? String(chunks[0]?.title ?? '') : null,
	};
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

/** The kinds of the golden set, in the order of the brief. */
const KINDS = ['lexical', 'paraphrase', 'multi', 'fr', 'negative', 'acl'];

/** The numbers of one group of questions. */
interface Group {
	n: number;
	scored: number;
	recall: number;
	mrr: number;
}

/** The numbers of a group: the recall and the MRR of the questions that have an expected page. */
function group(results: readonly QuestionResult[]): Group {
	const scored = results.filter((result) => result.recall !== null);
	return {
		n: results.length,
		scored: scored.length,
		recall: mean(scored.map((result) => result.recall ?? 0)),
		mrr: mean(scored.map((result) => (result.rank > 0 ? 1 / result.rank : 0))),
	};
}

/** The table of the groups. */
function groupTable(groups: readonly { label: string; group: Group }[]): string {
	const rows = groups.map(({ label, group: value }) => {
		const recall = value.scored === 0 ? '—' : share(value.recall);
		const mrr = value.scored === 0 ? '—' : value.mrr.toFixed(3);
		return `| ${label} | ${value.n} | ${value.scored} | ${recall} | ${mrr} |`;
	});
	return ['| kind | n | scored | recall@5 | MRR@5 |', '| --- | --- | --- | --- | --- |', ...rows].join('\n');
}

/** The results of one run, as the markdown of the report. */
function report(options: {
	results: QuestionResult[];
	groups: { label: string; group: Group }[];
	overall: Group;
	leaks: number;
	latency: { p50: number; p95: number };
	index: { ms: number; workMs: number; pages: number; chunks: number; embedded: number; withVector: number };
	mode: string;
}): string {
	const { results, groups, overall, leaks, latency, index, mode } = options;
	const negatives = results.filter((result) => result.kind === 'negative');
	// The top score of the negatives, and the lowest top score of a question
	// that found its page: the two are what a threshold would have to tell
	// apart.
	const negativeScores = negatives
		.map((result) => result.topScore)
		.filter((score): score is number => score !== null);
	const negativeTop = negativeScores.length > 0 ? Math.max(...negativeScores) : null;
	const answered = results.filter((result) => result.recall !== null && result.recall > 0 && result.topScore !== null);
	const answeredLow =
		answered.length > 0
			? answered.reduce((lowest, result) =>
					(result.topScore ?? 0) < (lowest.topScore ?? 0) ? result : lowest,
				)
			: null;
	const misses = results
		.filter((result) => result.recall !== null && result.recall < 1)
		.sort((left, right) => (left.recall ?? 0) - (right.recall ?? 0) || right.rank - left.rank);
	const worst = misses.slice(0, 5);
	const leakLines = results.flatMap((result) =>
		result.leaks.map((leak) => `- ${result.id} (${result.asker}): ${leak.page} — ${leak.reason}`),
	);

	const lines: string[] = [];
	lines.push('# The golden set, measured — hybrid retrieval with the real embedder');
	lines.push('');
	lines.push(`- Date: ${process.env.AI_EVAL_DATE ?? new Date().toISOString()}`);
	lines.push(`- Commit: \`${process.env.AI_EVAL_COMMIT ?? 'unknown'}\``);
	lines.push(`- Command: \`${process.env.AI_EVAL_COMMAND ?? 'unknown'}\``);
	lines.push(
		`- Images: \`${process.env.AI_EVAL_DB_IMAGE ?? 'pgvector/pgvector:0.8.0-pg16'}\`, ` +
			`\`${process.env.AI_EVAL_TEI_IMAGE ?? 'ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4'}\` ` +
			`(model \`${embedModel}\`), \`${process.env.AI_EVAL_NODE_IMAGE ?? 'node:22-bookworm-slim'}\``,
	);
	lines.push(`- Mode: ${mode}`);
	lines.push('');
	lines.push('## The index');
	lines.push('');
	lines.push(`- Pages indexed: ${index.pages} (the two archived pages are dropped by the indexer)`);
	lines.push(`- Chunks in the index: ${index.chunks}, of which ${index.withVector} carry a vector`);
	lines.push(
		`- Indexing time: ${(index.ms / 1000).toFixed(1)} s (the indexer's own 10 s debounce included; ` +
			`${(index.workMs / 1000).toFixed(1)} s of page work)`,
	);
	lines.push('');
	lines.push('## The results');
	lines.push('');
	lines.push('`scored` is the number of questions with a non-empty `expected`: the negative and the refused acl');
	lines.push('questions have none, and they are counted in `n` only.');
	lines.push('');
	lines.push(groupTable(groups));
	lines.push('');
	lines.push(`- Overall: n=${overall.n}, scored=${overall.scored}, recall@5=${share(overall.recall)}, MRR@5=${overall.mrr.toFixed(3)}`);
	lines.push(`- Leaks: ${leaks}${leaks === 0 ? ' (none)' : ''}`);
	lines.push(`- Latency of retrieve(): p50 ${latency.p50.toFixed(0)} ms, p95 ${latency.p95.toFixed(0)} ms (the embedding included)`);
	lines.push('');
	lines.push('## The negative questions');
	lines.push('');
	lines.push('The top fused score of a question nothing answers. A threshold that separates them from the');
	lines.push('answered ones would have to sit between the numbers below and the lowest score of an answered');
	lines.push('question; no threshold is added here.');
	lines.push('');
	lines.push('| id | question | top score | top page |');
	lines.push('| --- | --- | --- | --- |');
	for (const negative of negatives) {
		lines.push(
			`| ${negative.id} | ${negative.question} | ${negative.topScore === null ? '—' : negative.topScore.toFixed(5)} | ${negative.topTitle ?? '—'} |`,
		);
	}
	lines.push('');
	if (negativeTop !== null && answeredLow !== null && answeredLow.topScore !== null) {
		lines.push(
			`- The lowest top score of a question that found its page: ${answeredLow.topScore.toFixed(5)} (${answeredLow.id}).`,
		);
		lines.push(
			`- The highest top score of a negative question: ${negativeTop.toFixed(5)}.` +
				(negativeTop < answeredLow.topScore
					? ' A threshold between the two would separate them in THIS run.'
					: ' A threshold between the two would NOT separate them in this run.'),
		);
		lines.push(
			'- Caveat: the fused score is a reciprocal rank, not a magnitude. A chunk that is first in ONE of the',
		);
		lines.push('  two lists scores 1/61 ≈ 0.01639 whatever the question is, so the gap above is a property of');
		lines.push('  this run, not a property of the questions.');
	}
	lines.push('');
	lines.push('## The five worst misses');
	lines.push('');
	if (worst.length === 0) {
		lines.push('None: every question with an expected page found it.');
	} else {
		lines.push('| id | kind | question | expected | returned |');
		lines.push('| --- | --- | --- | --- | --- |');
		for (const miss of worst) {
			const expected = miss.expected.map((slug) => `${slug} (${titleBySlug.get(slug) ?? ''})`).join(', ');
			const returned = miss.returned.map((slug) => `${slug} (${titleBySlug.get(slug) ?? ''})`).join(', ');
			lines.push(`| ${miss.id} | ${miss.kind} | ${miss.question} | ${expected} | ${returned} |`);
		}
	}
	lines.push('');
	if (leakLines.length > 0) {
		lines.push('## The leaks');
		lines.push('');
		lines.push(...leakLines);
		lines.push('');
	}
	lines.push('## The caveat');
	lines.push('');
	lines.push('The corpus is synthetic, written by a model: the recall measured on it is a regression gate, not a');
	lines.push('quality claim about real workspaces. Fifty questions: ±0.07 on recall is noise. The embedder runs');
	lines.push('on the CPU of this machine, shared with the other work that is running.');
	lines.push('');
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// The main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const started = Date.now();
	console.log(`[eval] the embedder: ${embedUrl} (${embedModel})`);
	await applySeed();
	await addMembers();

	const index = await indexCorpus();
	// The chunks that carry a vector: the embedder really ran.
	const vectors = await db.query<{ n: number }>(
		'select count(*)::int as n from public.ai_chunks where embedding is not null',
	);
	const withVector = vectors.rows[0]?.n ?? 0;
	console.log(
		`[eval] the index: ${index.pages} pages, ${index.chunks} chunks, ${withVector} of them with a vector, ` +
			`${(index.ms / 1000).toFixed(1)} s (${(index.workMs / 1000).toFixed(1)} s of page work)`,
	);

	const pages = await readPages();
	const workspaces = new Map<string, string[]>();
	for (const key of Object.keys(USER_ID_BY_KEY)) {
		const user = authUser(key);
		workspaces.set(key, await liveMemberWorkspaces(db, user));
	}

	const results: QuestionResult[] = [];
	for (const question of questions) {
		const result = await ask(question, pages, workspaces.get(question.asker) ?? []);
		results.push(result);
		console.log(
			`[eval] ${result.id} ${result.kind} recall=${result.recall === null ? '—' : share(result.recall)} ` +
				`rank=${result.rank} pages=${result.returned.length} chunks=${result.chunks} ${result.latencyMs.toFixed(0)}ms` +
				(result.leaks.length > 0 ? ` LEAKS=${result.leaks.length}` : ''),
		);
	}

	// The numbers.
	const groups = KINDS.map((kind) => ({ label: kind, group: group(results.filter((r) => r.kind === kind)) }));
	const overall = group(results);
	const leaks = results.reduce((total, result) => total + result.leaks.length, 0);
	const latencies = results.map((result) => result.latencyMs).sort((left, right) => left - right);
	const latency = { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) };

	console.log('');
	console.log(groupTable(groups));
	console.log(
		`[eval] overall recall@5=${share(overall.recall)} MRR@5=${overall.mrr.toFixed(3)} ` +
			`(n=${overall.n}, scored=${overall.scored})`,
	);
	console.log(`[eval] leaks: ${leaks}`);
	console.log(`[eval] latency: p50 ${latency.p50.toFixed(0)} ms, p95 ${latency.p95.toFixed(0)} ms`);
	console.log(`[eval] the run took ${((Date.now() - started) / 1000).toFixed(1)} s`);

	const markdown = report({
		results,
		groups,
		overall,
		leaks,
		latency,
		index: { ...index, withVector },
		mode: skipAclFilter
			? 'THE BITE: the acl "cannot" questions are retrieved as the owner of the page that answers them'
			: 'the asker of the question retrieves, and the asker of the question scores',
	});
	const target = path.join(EVAL_DIR, resultsFile);
	writeFileSync(target, markdown, 'utf8');
	console.log(`[eval] the report: ${target}`);

	await db.end();
	if (leaks > 0) {
		console.error(`[eval] FAIL: ${leaks} leaks — a page the asker may not read, or an archived one, was returned`);
		process.exit(1);
	}
}

await main();

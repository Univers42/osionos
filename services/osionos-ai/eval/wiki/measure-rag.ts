/* ************************************************************************** */
/*                                                                            */
/*   measure-rag.ts      RAG at 110k chunks: hybrid, rerank, abstention       */
/*                                                                            */
/*   Runs the 200 questions of golden-wiki.jsonl through the service's REAL   */
/*   retrieve() twice per question, with the reranker off (variant 1) and     */
/*   on (variant 2), then calibrates and scores the abstention threshold      */
/*   (variant 3). It measures; it never tunes the retrieval.                  */
/*                                                                            */
/*   Both variants ask for 20 chunks: the metrics are @10 on distinct pages,  */
/*   which the product's 8 could not feed. The reranker scores the same 20    */
/*   fused candidates either way, so its scores (and the abstention) are the  */
/*   ones of the product.                                                     */
/*                                                                            */
/*   Caveat: the rerank latency is the time of the HTTP call to the TEI,      */
/*   taken by wrapping fetch; the retrieval latency is wall time of retrieve()*/
/*   on a shared CPU host, so both move with the load recorded in the report. */
/*   A question with no chunk at all has top score 0 and counts as abstained. */
/*                                                                            */
/*   environment:                                                             */
/*     OSIONOS_AI_DATABASE_URL, OSIONOS_AI_EMBED_URL, OSIONOS_AI_RERANK_URL   */
/*     OSIONOS_AI_RERANK_TIMEOUT_MS  (long here: CPU rerank is slow)          */
/*     MEASURE_META   json file: { command, sha, pins[], load[] }             */
/*     MEASURE_OUT    the markdown report to write                            */
/* ************************************************************************** */

import { readFileSync, writeFileSync } from 'node:fs';
import { Pool } from 'pg';
import type { AuthUser } from '../../src/auth.ts';
import { retrieve } from '../../src/retrieval/search.ts';
import { GOLDEN_FILE } from './golden.mjs';
import {
	bootstrapCi,
	bootstrapIndices,
	bestThreshold,
	classification,
	mean,
	meanWithCi,
	ndcgAt,
	pairedDifference,
	percentile,
	rankOf,
	recallAt,
	reciprocalRankAt,
	splitHalves,
} from './rag-stats.mjs';

interface Question {
	id: string;
	q: string;
	kind: 'answerable' | 'unanswerable';
	expected: string[];
}

interface Run {
	pages: string[];
	topRerank: number;
	ms: number;
}

const RESULT_PAGES = 10;
const CHUNKS_ASKED = 20;
const DECISION_F1 = 0.6;

const questions: Question[] = readFileSync(GOLDEN_FILE, 'utf8')
	.split('\n')
	.filter((line) => line.length > 0)
	.map((line) => JSON.parse(line) as Question);
const meta = JSON.parse(readFileSync(process.env.MEASURE_META ?? '', 'utf8')) as {
	command: string;
	sha: string;
	pins: string[];
	load: string[];
};
const db = new Pool({ connectionString: process.env.OSIONOS_AI_DATABASE_URL, max: 2 });

// The time of every call to /rerank, taken where the service makes it.
const rerankMs: number[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
	const started = performance.now();
	try {
		return await realFetch(input, init);
	} finally {
		if (url.endsWith('/rerank')) rerankMs.push(performance.now() - started);
	}
};
// A rerank fallback would silently turn variant 2 into variant 1: count them.
let fallbacks = 0;
const realWarn = console.warn;
console.warn = (line: unknown): void => {
	if (String(line).includes('rerank_fallback')) fallbacks += 1;
	realWarn(line);
};

async function asker(): Promise<AuthUser> {
	const result = await db.query<{ workspace_id: string; owner_id: string }>(
		`select workspace_id, owner_id from public.osionos_pages
		 group by workspace_id, owner_id order by count(*) desc limit 1`,
	);
	const row = result.rows[0];
	return { userId: row.owner_id, workspaceId: row.workspace_id, memberWorkspaces: [], isAdmin: false, issuedAtMs: Date.now() };
}

async function run(user: AuthUser, question: string): Promise<Run> {
	const started = performance.now();
	const chunks = await retrieve(db, user, { query: question, limit: CHUNKS_ASKED });
	const ms = performance.now() - started;
	const pages = [...new Set(chunks.map((chunk) => chunk.pageId))].slice(0, RESULT_PAGES);
	const topRerank = Math.max(0, ...chunks.map((chunk) => chunk.rerankScore ?? 0));
	return { pages, topRerank, ms };
}

const fmt = (value: number, digits = 3): string => value.toFixed(digits);
const ci = (cell: { value: number; low: number; high: number }): string =>
	`${fmt(cell.value)} [${fmt(cell.low)}, ${fmt(cell.high)}]`;

function rankingTable(runs: Run[], answerable: number[], expected: string[]): Record<string, number[]> {
	const ranks = answerable.map((index, at) => rankOf(runs[index].pages, expected[at]));
	return {
		'recall@5': ranks.map((rank) => recallAt(rank, 5)),
		'MRR@10': ranks.map((rank) => reciprocalRankAt(rank, RESULT_PAGES)),
		'nDCG@10': ranks.map((rank) => ndcgAt(rank, RESULT_PAGES)),
	};
}

async function main(): Promise<void> {
	const user = await asker();
	const counts = await db.query<{ chunks: string; pages: string }>(
		`select (select count(*) from public.ai_chunks)::text as chunks, (select count(*) from public.osionos_pages)::text as pages`,
	);
	await run(user, 'warm up the connection and the models'); // not measured
	rerankMs.length = 0;
	fallbacks = 0;

	const hybrid: Run[] = [];
	const reranked: Run[] = [];
	for (const [position, question] of questions.entries()) {
		delete process.env.OSIONOS_AI_RERANK_URL;
		hybrid.push(await run(user, question.q));
		process.env.OSIONOS_AI_RERANK_URL = rerankUrl;
		reranked.push(await run(user, question.q));
		console.error(`[measure] ${position + 1}/${questions.length}`);
	}

	const answerable = questions.flatMap((question, index) => (question.kind === 'answerable' ? [index] : []));
	const expected = answerable.map((index) => questions[index].expected[0]);
	const indices = bootstrapIndices(answerable.length);
	const one = rankingTable(hybrid, answerable, expected);
	const two = rankingTable(reranked, answerable, expected);
	const rankingRows = (table: Record<string, number[]>): string =>
		Object.entries(table).map(([name, values]) => `| ${name} | ${ci(meanWithCi(values, indices))} |`).join('\n');
	const differences = Object.keys(one).map((name) => ({ name, ...pairedDifference(one[name], two[name], indices) }));
	const latency = (values: number[]): string => `p50 ${percentile(values, 0.5).toFixed(0)} ms, p95 ${percentile(values, 0.95).toFixed(0)} ms (n=${values.length})`;

	// Abstention: the best cut of the calibration half, scored on the test half.
	const scored = questions.map((question, index) => ({
		id: question.id,
		positive: question.kind === 'unanswerable',
		score: reranked[index].topRerank,
	}));
	const { calibration, test } = splitHalves(scored);
	const cut = bestThreshold(calibration);
	const predicted = test.map((item) => ({ positive: item.positive, predicted: item.score < cut.threshold }));
	const testIndices = bootstrapIndices(predicted.length);
	const metric = (pick: (sample: typeof predicted) => number) => ({ value: pick(predicted), ...bootstrapCi(predicted, testIndices, pick) });
	const precision = metric((sample) => classification(sample).precision);
	const recall = metric((sample) => classification(sample).recall);
	const f1 = metric((sample) => classification(sample).f1);
	const wrong = metric((sample) => {
		const kept = sample.filter((item) => !item.positive);
		return kept.length === 0 ? 0 : mean(kept.map((item) => (item.predicted ? 1 : 0)));
	});
	const median = (positive: boolean): number => percentile(scored.filter((item) => item.positive === positive).map((item) => item.score), 0.5);

	const recallGain = differences.find((entry) => entry.name === 'recall@5');
	const keep = (recallGain?.low ?? 0) > 0 || f1.value >= DECISION_F1;
	const decision = keep
		? `Reranker kept: recall@5 paired CI low ${fmt(recallGain?.low ?? 0)} (needs > 0) / abstention F1 on the test half ${fmt(f1.value)} (needs >= ${DECISION_F1}); at least one holds.`
		: `Reranker not kept: recall@5 paired CI low ${fmt(recallGain?.low ?? 0)} (needs > 0) and abstention F1 on the test half ${fmt(f1.value)} (needs >= ${DECISION_F1}); neither holds.`;

	const report = `# RAG at ${counts.rows[0].chunks} chunks: hybrid, rerank, abstention (M2)

Measured, not claimed: every number below comes from the command in "Reproduce". The 200 questions are drafted
by a 4B model and checked by nobody (see the Caveats); read the numbers as "on this set".

## Decision

${decision}

## Reproduce

\`\`\`sh
${meta.command}
\`\`\`

- commit: \`${meta.sha}\`
- corpus: ${counts.rows[0].chunks} chunks, ${counts.rows[0].pages} pages (Simple English Wikipedia, ${questions.length} questions: ${answerable.length} answerable, ${questions.length - answerable.length} not)
- rerank fallbacks during the run: ${fallbacks} (any fallback would make variant 2 partly variant 1)
- pins:
${meta.pins.map((pin) => `  - ${pin}`).join('\n')}

## Load when measured

${meta.load.map((line) => `- \`${line}\``).join('\n')}

## Variant 1: hybrid (reranker off), ${answerable.length} answerable questions

Mean [95% bootstrap CI, 1000 resamples, seed 42]; binary relevance on distinct pages.

| Metric | Value |
|---|---|
${rankingRows(one)}

Retrieval latency, all ${questions.length} questions: ${latency(hybrid.map((entry) => entry.ms))}

## Variant 2: hybrid + rerank (top 20 to the cross-encoder), ${answerable.length} answerable questions

| Metric | Value |
|---|---|
${rankingRows(two)}

Retrieval latency including the rerank, all ${questions.length} questions: ${latency(reranked.map((entry) => entry.ms))}
Rerank call by itself: ${latency(rerankMs)}

### Variant 2 minus variant 1, paired (same questions, same resamples)

| Metric | Difference |
|---|---|
${differences.map((entry) => `| ${entry.name} | ${ci(entry)} |`).join('\n')}

## Variant 3: abstention on the rerank score

Positive = unanswerable. Rule: abstain when the best rerank score of the 20 candidates is under the threshold.
The halves are drawn with seed 42: each holds 80 answerable and 20 unanswerable questions.

- median top rerank score: ${fmt(median(false))} on answerable, ${fmt(median(true))} on unanswerable
- threshold chosen on the calibration half: ${fmt(cut.threshold, 4)} (calibration F1 ${fmt(cut.f1)})

| Test half (n=${test.length}) | Value [95% CI] |
|---|---|
| precision | ${ci(precision)} |
| recall | ${ci(recall)} |
| F1 | ${ci(f1)} |
| answerable wrongly abstained | ${ci(wrong)} |

The hybrid alone cannot be scored this way: its RRF top score does not separate the two groups (eval/RESULTS.md).

## Caveats

- The questions are LLM-drafted (Qwen3-4B-Instruct-2507) and 0 are human-validated; a wrong or ambiguous question lowers every metric.
- "Unanswerable" is approximate: another imported article may still mention the subject.
- Latency is CPU on a shared host, at the load above; a different host moves it. The default rerank timeout (1500 ms) is not what this run used: it ran with OSIONOS_AI_RERANK_TIMEOUT_MS=${process.env.OSIONOS_AI_RERANK_TIMEOUT_MS}.
- The threshold holds for this model and this corpus only; another reranker or corpus needs its own measurement.
- Relevance is one page per question, so recall@5 is "is the source page in the first 5 distinct pages".
- The bootstrap resamples questions; it does not capture drafting variance across another LLM run.
`;
	writeFileSync(process.env.MEASURE_OUT ?? 'RESULTS-rag.md', report);
	console.error(decision);
	await db.end();
}

const rerankUrl = process.env.OSIONOS_AI_RERANK_URL ?? '';
if (rerankUrl.length === 0 || !process.env.OSIONOS_AI_DATABASE_URL || !process.env.OSIONOS_AI_EMBED_URL) {
	console.error('[measure] OSIONOS_AI_DATABASE_URL, OSIONOS_AI_EMBED_URL and OSIONOS_AI_RERANK_URL are needed');
	process.exit(2);
}
await main();

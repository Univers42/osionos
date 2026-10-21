/* ************************************************************************** */
/*                                                                            */
/*   run.ts                                            the golden-set runner   */
/*                                                                            */
/*   Measures the retrieval of the service (src/retrieval/search.ts) on the  */
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

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { canReadPageRowAsMember } from '../../../scripts/bridge-page-read.mjs';
import { retrieve } from '../src/retrieval/search.ts';
import { pageId, readGolden } from './lib.mjs';
import { report } from './report.ts';
import type { GoldenQuestion, QuestionResult } from './score.ts';
import { KINDS, group, groupTable, percentile } from './score.ts';
import { startStack } from './stack.ts';
import type { EvalStack } from './stack.ts';

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));

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

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** One question, asked. */
async function ask(
	question: GoldenQuestion,
	stack: EvalStack,
	workspaces: readonly string[],
	askerUserId: string,
): Promise<QuestionResult> {
	const begin = performance.now();
	const chunks = await retrieve(stack.db, stack.retrievalUser(question), { query: question.q, limit: 5 });
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
		const row = stack.pages.get(id);
		if (!row) {
			leaks.push({ page: stack.slugByPageId.get(id) ?? id, reason: 'the page is not in the database' });
			continue;
		}
		if (row.archived_at) {
			leaks.push({ page: stack.slugByPageId.get(id) ?? id, reason: 'the page is archived' });
			continue;
		}
		if (!canReadPageRowAsMember(row, askerUserId, workspaces)) {
			leaks.push({ page: stack.slugByPageId.get(id) ?? id, reason: 'the asker may not read the page' });
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
		returned: returned.map((id) => stack.slugByPageId.get(id) ?? id),
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
// The main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const started = Date.now();
	console.log(`[eval] the embedder: ${embedUrl} (${embedModel})`);
	const { stack, index } = await startStack({ databaseUrl, embedUrl, embedModel, indexTimeoutMs, skipAclFilter });

	const results: QuestionResult[] = [];
	for (const question of questions) {
		const asker = stack.authUser(question.asker);
		const result = await ask(
			question,
			stack,
			stack.workspaces.get(question.asker) ?? [],
			asker.userId,
		);
		results.push(result);
		console.log(
			`[eval] ${result.id} ${result.kind} recall=${result.recall === null ? '—' : result.recall.toFixed(2)} ` +
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
		`[eval] overall recall@5=${overall.recall.toFixed(2)} MRR@5=${overall.mrr.toFixed(3)} ` +
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
		index,
		mode: skipAclFilter
			? 'THE BITE: the acl "cannot" questions are retrieved as the owner of the page that answers them'
			: 'the asker of the question retrieves, and the asker of the question scores',
		titleBySlug: stack.titleBySlug,
		embedModel,
	});
	const target = path.join(EVAL_DIR, resultsFile);
	writeFileSync(target, markdown, 'utf8');
	console.log(`[eval] the report: ${target}`);

	await stack.db.end();
	if (leaks > 0) {
		console.error(`[eval] FAIL: ${leaks} leaks — a page the asker may not read, or an archived one, was returned`);
		process.exit(1);
	}
}

await main();

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
/*   The variants of the multilingual experiment (eval/variants.ts) are      */
/*   measured on the same corpus, the same index and the same questions.     */
/*   One variant (A, the default) writes the report of the golden set;      */
/*   several variants write the comparison of the experiment.                 */
/*                                                                            */
/*   It measures. It never tunes: the retrieval of variant A is the one of   */
/*   the service, and nothing is changed to make a number better.            */
/*                                                                            */
/*   The environment:                                                        */
/*     OSIONOS_AI_DATABASE_URL  the database of the stack                     */
/*     OSIONOS_AI_EMBED_URL     the embedding service (the local TEI)        */
/*     OSIONOS_AI_EMBED_MODEL   the model the service loads                  */
/*     OSIONOS_AI_LLM_URL       the local llama.cpp server (variants C, D)   */
/*     OSIONOS_AI_LLM_MODEL     the model that server loads                  */
/*     AI_EVAL_VARIANTS         the variants to measure: A, B, C, D or all    */
/*     AI_EVAL_RESULTS_FILE     the file of the report (RESULTS.md)          */
/*     AI_EVAL_SKIP_ACL_FILTER  the bite of the leak check (see below)      */
/*                                                                            */
/*   No dependencies beyond the service's own. Node 22.                       */
/* ************************************************************************** */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Embedder } from '../src/indexer/embedder.ts';
import { languageMap } from './fusion.ts';
import { readGolden } from './lib.mjs';
import { Translator } from './llm.ts';
import { multilingualReport } from './multilingual-report.ts';
import { report } from './report.ts';
import type { GoldenQuestion, QuestionResult } from './score.ts';
import { KINDS, group, groupTable, percentile, toResult } from './score.ts';
import { startStack } from './stack.ts';
import { answerOf } from './variants.ts';
import type { VariantContext, VariantId } from './variants.ts';

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));

const databaseUrl = process.env.OSIONOS_AI_DATABASE_URL ?? '';
const embedUrl = process.env.OSIONOS_AI_EMBED_URL ?? '';
const embedModel = process.env.OSIONOS_AI_EMBED_MODEL ?? 'intfloat/multilingual-e5-small';
const llmUrl = process.env.OSIONOS_AI_LLM_URL ?? '';
const llmModel = process.env.OSIONOS_AI_LLM_MODEL ?? 'qwen3-4b';
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
/** The variants to measure. */
const variants = parseVariants(process.env.AI_EVAL_VARIANTS ?? 'A');
/** The debug mode: the rewrites of the LLM and the pages of every answer. */
const debug = (process.env.AI_EVAL_DEBUG ?? '').trim() === '1';

if (databaseUrl.length === 0 || embedUrl.length === 0) {
	console.error('[eval] refusing to start: OSIONOS_AI_DATABASE_URL and OSIONOS_AI_EMBED_URL are needed');
	process.exit(2);
}

/** The variants of the run: "A", "B", "C", "D", "all", or a comma separated list. */
function parseVariants(raw: string): VariantId[] {
	const wanted = raw
		.split(',')
		.map((entry) => entry.trim().toUpperCase())
		.filter((entry) => entry.length > 0);
	if (wanted.length === 0) return ['A'];
	if (wanted.includes('ALL')) return ['A', 'B', 'C', 'D'];
	const ids = wanted.filter((entry): entry is VariantId => ['A', 'B', 'C', 'D'].includes(entry));
	if (ids.length === 0) {
		console.error(`[eval] unknown variant: ${raw}`);
		process.exit(2);
	}
	return ids;
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
// The main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const started = Date.now();
	console.log(`[eval] the embedder: ${embedUrl} (${embedModel})`);
	console.log(`[eval] the variants: ${variants.join(', ')}`);
	const needsLlm = variants.some((variant) => variant === 'C' || variant === 'D');
	if (needsLlm && llmUrl.length === 0) {
		console.error('[eval] refusing to start: OSIONOS_AI_LLM_URL is needed by the variants C and D');
		process.exit(2);
	}

	const { stack, index } = await startStack({ databaseUrl, embedUrl, embedModel, indexTimeoutMs, skipAclFilter });
	const languages = await languageMap(stack.db);
	console.log(
		`[eval] the languages of the chunks: ${languages.english.length} in english, ${languages.french.length} in french`,
	);
	const embedder = new Embedder({ baseUrl: embedUrl, model: embedModel });
	const translator = needsLlm ? new Translator({ baseUrl: llmUrl, model: llmModel }) : null;

	const results = new Map<VariantId, QuestionResult[]>(variants.map((variant) => [variant, []]));
	const llmLatencies: number[] = [];

	for (const question of questions) {
		const asker = stack.authUser(question.asker);
		const workspaces = stack.workspaces.get(question.asker) ?? [];
		const retrievalUser = stack.retrievalUser(question);
		let rewrites = { english: question.q, french: question.q };
		if (needsLlm && translator) {
			const translation = await translator.translate(question.q);
			rewrites = { english: translation.english, french: translation.french };
			llmLatencies.push(translation.ms);
			if (debug) {
				console.log(`[eval] ${question.id} LLM english: ${translation.english}`);
				console.log(`[eval] ${question.id} LLM french: ${translation.french}`);
			}
		}
		for (const variant of variants) {
			const context: VariantContext = {
				db: stack.db,
				user: retrievalUser,
				workspaces,
				embedder,
				languages,
			};
			const answer = await answerOf(variant, question.q, context, rewrites);
			// The LLM is the price of the variants C and D only: the other two
			// do not pay for it, and their latency does not carry it.
			if (variant === 'C' || variant === 'D') {
				answer.llmMs = llmLatencies[llmLatencies.length - 1] ?? null;
			}
			const result = toResult(question, answer, stack, asker.userId, workspaces);			results.get(variant)?.push(result);
			console.log(
				`[eval] ${variant} ${result.id} ${result.kind} recall=${result.recall === null ? '—' : result.recall.toFixed(2)} ` +
					`rank=${result.rank} pages=${result.returned.length} chunks=${result.chunks} ${result.latencyMs.toFixed(0)}ms` +
					(result.llmMs === null ? '' : ` llm=${result.llmMs.toFixed(0)}ms`) +
					(result.leaks.length > 0 ? ` LEAKS=${result.leaks.length}` : ''),
			);
			if (debug) {
				console.log(`[eval] ${variant} ${result.id} returned: ${result.returned.join(', ')}`);
			}
		}
	}

	// The numbers, per variant.
	const runs = variants.map((variant) => {
		const variantResults = results.get(variant) ?? [];
		const groups = KINDS.map((kind) => ({
			label: kind,
			group: group(variantResults.filter((result) => result.kind === kind)),
		}));
		const latencies = variantResults.map((result) => result.latencyMs).sort((left, right) => left - right);
		const withLlm = variantResults
			.map((result) => result.latencyMs + (result.llmMs ?? 0))
			.sort((left, right) => left - right);
		return {
			variant,
			results: variantResults,
			groups,
			overall: group(variantResults),
			leaks: variantResults.reduce((total, result) => total + result.leaks.length, 0),
			latency: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
			latencyWithLlm: { p50: percentile(withLlm, 0.5), p95: percentile(withLlm, 0.95) },
		};
	});

	for (const run of runs) {
		console.log('');
		console.log(groupTable(run.groups));
		console.log(
			`[eval] ${run.variant} overall recall@5=${run.overall.recall.toFixed(2)} MRR@5=${run.overall.mrr.toFixed(3)} ` +
				`(n=${run.overall.n}, scored=${run.overall.scored}) leaks=${run.leaks} ` +
				`latency p50 ${run.latency.p50.toFixed(0)} ms p95 ${run.latency.p95.toFixed(0)} ms`,
		);
	}
	if (llmLatencies.length > 0) {
		const sorted = [...llmLatencies].sort((left, right) => left - right);
		console.log(
			`[eval] the LLM: p50 ${percentile(sorted, 0.5).toFixed(0)} ms, p95 ${percentile(sorted, 0.95).toFixed(0)} ms ` +
				`over ${sorted.length} calls`,
		);
	}
	console.log(`[eval] the run took ${((Date.now() - started) / 1000).toFixed(1)} s`);

	const markdown =
		runs.length === 1
			? report({
					results: runs[0]?.results ?? [],
					groups: runs[0]?.groups ?? [],
					overall: runs[0]?.overall ?? { n: 0, scored: 0, recall: 0, mrr: 0 },
					leaks: runs[0]?.leaks ?? 0,
					latency: runs[0]?.latency ?? { p50: 0, p95: 0 },
					index,
					mode: skipAclFilter
						? 'THE BITE: the acl "cannot" questions are retrieved as the owner of the page that answers them'
						: 'the asker of the question retrieves, and the asker of the question scores',
					titleBySlug: stack.titleBySlug,
					embedModel,
				})
			: multilingualReport({
					runs,
					llm: llmLatencies,
					index,
					titleBySlug: stack.titleBySlug,
					embedModel,
				});
	const target = path.join(EVAL_DIR, resultsFile);
	writeFileSync(target, markdown, 'utf8');
	console.log(`[eval] the report: ${target}`);

	await stack.db.end();
	const leaks = runs.reduce((total, run) => total + run.leaks, 0);
	if (leaks > 0) {
		console.error(`[eval] FAIL: ${leaks} leaks — a page the asker may not read, or an archived one, was returned`);
		process.exit(1);
	}
}

await main();

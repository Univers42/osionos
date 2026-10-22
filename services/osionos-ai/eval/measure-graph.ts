/* ************************************************************************** */
/*                                                                            */
/*   measure-graph.ts                                   the graph's measures   */
/*                                                                            */
/*   Measures what the graph's slice adds, on the eval corpus:              */
/*                                                                            */
/*     indexer    the cost of indexing a page, and the cost the page VECTOR  */
/*                adds to it (the weighted mean and its one query);          */
/*     retrieval  the p95 of retrieve() on the golden set — the same number  */
/*                the P3 harness reports, so the two are comparable;         */
/*     related    the p95 of the related read on the corpus's pages.         */
/*                                                                            */
/*   The environment:                                                        */
/*     OSIONOS_AI_DATABASE_URL  the database of the stack                     */
/*                                                                            */
/*   The embedding is the in-process mock (tests/mockEmbed.ts): it is        */
/*   deterministic, so the measure is the same on every run, and the         */
/*   embedding time is NOT part of it (the real TEI is measured by the P3     */
/*   harness, eval/run.sh).                                                   */
/*                                                                            */
/*   usage: node --experimental-strip-types eval/measure-graph.ts <mode>      */
/* ************************************************************************** */

import { Pool } from 'pg';
import { IndexerWorker } from '../src/indexer/worker.ts';
import { retrieve } from '../src/retrieval/search.ts';
import { startMockEmbedder, vectorFor } from '../tests/mockEmbed.ts';
import { USER_IDS, WORKSPACE_ID, pageId, readCorpus, readGolden } from './lib.mjs';
import type { AuthUser } from '../src/auth.ts';
import type { EmbedClient } from '../src/indexer/embedder.ts';

/** The modes of the script. */
const mode = process.argv[2] ?? 'retrieval';

const pool = new Pool({ connectionString: process.env.OSIONOS_AI_DATABASE_URL ?? '', max: 4 });
const mock = await startMockEmbedder();
process.env.OSIONOS_AI_EMBED_URL = mock.baseUrl;
process.env.OSIONOS_AI_EMBED_MODEL = 'intfloat/multilingual-e5-small';

/** The embedder of the measure: the mock's vectors, without a service. */
const embedder: EmbedClient = {
	model: 'intfloat/multilingual-e5-small',
	maxInputsPerRequest: 32,
	passageInput: (headingPath: string, content: string) => `passage: ${headingPath}\n${content}`,
	embedCall: async (inputs: readonly string[]) => ({
		vectors: inputs.map((input) => vectorFor(input)),
		ms: 0,
		status: 200,
	}),
};

/** The p95 of a list of milliseconds. */
function p95(samples: number[]): number {
	if (samples.length === 0) return 0;
	const sorted = [...samples].sort((left, right) => left - right);
	const index = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
	return Number((sorted[index] ?? 0).toFixed(2));
}

/** The p50 of a list of milliseconds. */
function p50(samples: number[]): number {
	if (samples.length === 0) return 0;
	const sorted = [...samples].sort((left, right) => left - right);
	return Number((sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(2));
}

/** The caller of the corpus: a user of the eval, in the workspace of the corpus. */
function callerOf(userKey: string | undefined): AuthUser {
	const users = USER_IDS as Record<string, string>;
	return {
		userId: (userKey && users[userKey]) || Object.values(users)[0] || '',
		workspaceId: WORKSPACE_ID,
		memberWorkspaces: [],
		isAdmin: false,
		issuedAtMs: Date.now(),
	};
}

const corpus = readCorpus();

/** The indexer over the corpus: the pages get their chunks and their vectors. */
async function indexCorpus(): Promise<number> {
	const worker = new IndexerWorker({ pool, embedder, debounceSeconds: 0, log: () => undefined });
	const started = Date.now();
	for (let round = 0; round < 30; round += 1) {
		const claimed = await worker.tick();
		if (claimed === 0) break;
	}
	return Date.now() - started;
}

if (mode === 'indexer') {
	// The indexer over the corpus: the time of a page, and the time the page
	// VECTOR adds to it.
	const total = await indexCorpus();
	const pages = corpus.length;
	console.log(`[measure] the indexer wrote ${pages} pages in ${total} ms (${(total / Math.max(1, pages)).toFixed(2)} ms per page)`);

	// The added cost: the weighted mean of the chunks and the one query that
	// writes it — the two things the page vector adds to the indexer.
	const chunks = await pool.query<{ source_id: string; heading_path: string; content: string; embedding: string }>(
		`select source_id, heading_path, content, embedding::text as embedding
		   from public.ai_chunks where source_kind = 'page' order by ord`,
	);
	const { pageVector } = await import('../src/indexer/pageVector.ts');
	const { estimateTokens } = await import('../src/indexer/chunker.ts');
	const byPage = new Map<string, { heading_path: string; content: string; embedding: string }[]>();
	for (const chunk of chunks.rows) {
		const list = byPage.get(chunk.source_id) ?? [];
		list.push(chunk);
		byPage.set(chunk.source_id, list);
	}
	let meanMs = 0;
	let writeMs = 0;
	for (const [source, list] of byPage) {
		const meanStarted = Date.now();
		const mean = pageVector(
			list.map((chunk) => ({
				vector: JSON.parse(chunk.embedding) as number[],
				tokens: estimateTokens(embedder.passageInput(chunk.heading_path, chunk.content)),
			})),
		);
		meanMs += Date.now() - meanStarted;
		if (!mean) continue;
		const writeStarted = Date.now();
		await pool.query(`select public.ai_write_page_vector($1::uuid, $2::uuid, $3::halfvec, 'measure')`, [
			WORKSPACE_ID,
			source,
			JSON.stringify(mean),
		]);
		writeMs += Date.now() - writeStarted;
	}
	const count = Math.max(1, byPage.size);
	console.log(
		`[measure] the page vector adds ${(meanMs / count).toFixed(3)} ms of mean and ${(writeMs / count).toFixed(2)} ms of write per page (${count} pages)`,
	);
} else if (mode === 'retrieval') {
	// The pages need their chunks: the indexer runs first, on the same corpus.
	await indexCorpus();
	const questions = readGolden();
	const samples: number[] = [];
	for (const question of questions) {
		const started = Date.now();
		await retrieve(pool, callerOf(question.asker), { query: question.q });
		samples.push(Date.now() - started);
	}
	console.log(
		`[measure] the retrieval of ${questions.length} questions: p50 ${p50(samples)} ms, p95 ${p95(samples)} ms`,
	);
} else if (mode === 'related') {
	// The pages need their vectors: the indexer runs first, on the same corpus.
	await indexCorpus();
	const { relatedPages } = await import('../src/retrieval/related.ts');
	const samples: number[] = [];
	let found = 0;
	for (const page of corpus) {
		// The owner of the page: the measure is of a page the caller may read.
		const started = Date.now();
		const owner = (page.meta as { owner?: string }).owner;
		const related = await relatedPages(pool, callerOf(owner), pageId(page.slug), 8);
		samples.push(Date.now() - started);
		found += related?.length ?? 0;
	}
	console.log(`[measure] the related read of ${corpus.length} pages: p95 ${p95(samples)} ms, ${found} neighbours in all`);
} else {
	console.error(`unknown mode: ${mode}`);
	process.exit(2);
}

await pool.end();
await mock.close();

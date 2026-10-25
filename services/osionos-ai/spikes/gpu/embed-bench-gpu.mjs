// The embedder benchmark of the GPU spike (AI-P0d, Part B).
//
// The same three numbers for every embedding service, TEI (the CPU one) and
// llama.cpp on the GPU:
//
//   (a) the query p95, one query at a time;
//   (b) the backfill: the chunks of the eval corpus, batch 32, concurrency 4,
//       in chunks per second;
//   (c) the query p95 WHILE the backfill runs: the head of line blocking of
//       a service that is busy.
//
// The passages are the real chunks of the corpus (services/osionos-ai/src/
// indexer/chunker.ts), with the prefixes the service sends
// (services/osionos-ai/src/indexer/embedder.ts): "passage: " for a chunk,
// "query: " for a question.
//
//   node embed-bench-gpu.mjs
//
// Env:
//   EMBED_URL    the base url of the service
//   EMBED_STYLE  tei | openai   (the shape of the API)
//   QUERIES      the number of query samples       (default 300)
//   PASSAGES     the number of passages of the backfill (default 1000)
//   BATCH        the passages per request          (default 32)
//   CONC         the requests in flight of the backfill (default 4)
//   MODEL        the model id, for the report
//   READY_FILE   optional marker written when backfill starts
//   STOP_FILE    optional marker: repeat backfill batches until it exists
//   LLM_ACTIVE_FILE optional arrival-window marker required during query measurements
//   OUT          a file to write the JSON to

import { existsSync, writeFileSync } from 'node:fs';
import { corpusChunks } from './requests.mjs';
import { readGolden } from '../../eval/lib.mjs';

const BASE = (process.env.EMBED_URL || 'http://127.0.0.1:4911').replace(/\/$/, '');
const STYLE = process.env.EMBED_STYLE || 'tei';
const QUERIES = Number(process.env.QUERIES || 300);
const PASSAGES = Number(process.env.PASSAGES || 1000);
const BATCH = Number(process.env.BATCH || 32);
const CONC = Number(process.env.CONC || 4);
const MODEL = process.env.MODEL || '';

/** The percentile of a sorted list, nearest rank. */
function pct(sorted, p) {
	if (sorted.length === 0) return NaN;
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
	return sorted[index];
}
const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : 'n/a');
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

/** One call to the embedding service: the inputs in, the vectors out. */
async function embed(inputs) {
	if (STYLE === 'openai') {
		const res = await fetch(`${BASE}/v1/embeddings`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ input: inputs, model: MODEL || undefined }),
		});
		if (!res.ok) throw new Error(`POST /v1/embeddings -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
		const json = await res.json();
		return json.data.map((row) => row.embedding);
	}
	const res = await fetch(`${BASE}/embed`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ inputs, truncate: true }),
	});
	if (!res.ok) throw new Error(`POST /embed -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
	const json = await res.json();
	if (Array.isArray(json)) return json;
	if (json && Array.isArray(json.embeddings)) return json.embeddings;
	throw new Error(`unexpected /embed shape: ${JSON.stringify(json).slice(0, 200)}`);
}

// ---------------------------------------------------------------- the data
// The chunks of the corpus, the way the indexer embeds them.
const chunks = corpusChunks();
const passages = [];
for (const page of chunks) {
	for (const chunk of page.chunks) {
		passages.push(`passage: ${chunk.headingPath}\n${chunk.content}`);
	}
}
console.log(`the corpus has ${chunks.length} pages and ${passages.length} chunks`);

// The questions of the golden set, the way the retrieval embeds them.
const questions = readGolden()
	.filter((question) => question.kind !== 'acl')
	.map((question) => `query: ${question.q}`);

// The passages of the backfill: the corpus chunks, cycled to the number of
// passages the run asks for (the corpus is small: 40 pages).
const backfillInputs = [];
for (let index = 0; backfillInputs.length < PASSAGES; index += 1) {
	backfillInputs.push(passages[index % passages.length]);
}

function requireLlmActive() {
	if (process.env.LLM_ACTIVE_FILE && !existsSync(process.env.LLM_ACTIVE_FILE)) {
		throw new Error('LLM arrival window ended before the query measurement finished');
	}
}

// ---------------------------------------------------------------- (a) the query p95
console.log(`\n== (a) QUERY LATENCY (sequential, n=${QUERIES}) ==`);
for (let index = 0; index < 10; index += 1) await embed([questions[index % questions.length]]);
const queryLat = [];
for (let index = 0; index < QUERIES; index += 1) {
	requireLlmActive();
	const input = questions[index % questions.length];
	const started = performance.now();
	await embed([input]);
	queryLat.push(performance.now() - started);
	requireLlmActive();
}
const sortedQuery = [...queryLat].sort((a, b) => a - b);
console.log(
	`query p50=${fmt(pct(sortedQuery, 50))} ms  p95=${fmt(pct(sortedQuery, 95))} ms  ` +
		`p99=${fmt(pct(sortedQuery, 99))} ms  mean=${fmt(mean(queryLat))} ms  n=${queryLat.length}`,
);

// ---------------------------------------------------------------- (b) the backfill
console.log(`\n== (b) BACKFILL (${PASSAGES} passages, batch=${BATCH}, concurrency=${CONC}) ==`);
const batches = [];
for (let index = 0; index < PASSAGES; index += BATCH) batches.push(backfillInputs.slice(index, index + BATCH));
let done = 0;
let repeatIndex = 0;
let passagesDone = 0;
const backfillStarted = performance.now();
await Promise.all(
	Array.from({ length: CONC }, async () => {
		for (;;) {
			let batch = batches.shift();
			if (!batch && process.env.STOP_FILE && !existsSync(process.env.STOP_FILE)) {
				batch = Array.from({ length: BATCH }, () => backfillInputs[repeatIndex++ % backfillInputs.length]);
			}
			if (!batch) return;
			const pending = embed(batch);
			if (process.env.READY_FILE) writeFileSync(process.env.READY_FILE, 'ready\n');
			await pending;
			passagesDone += batch.length;
			done += 1;
			if (done % 10 === 0) {
				const elapsed = (performance.now() - backfillStarted) / 1000;
				console.log(`  ... ${done}/${batches.length + done} batches, ${fmt((done * BATCH) / elapsed, 1)} chunks/s`);
			}
		}
	}),
);
const backfillMs = performance.now() - backfillStarted;
const chunksPerSecond = passagesDone / (backfillMs / 1000);
console.log(`backfill: ${fmt(backfillMs / 1000)} s -> ${fmt(chunksPerSecond, 2)} chunks/s`);

// ---------------------------------------------------------------- (c) the query p95 under the backfill
console.log(`\n== (c) QUERY LATENCY WHILE THE BACKFILL RUNS ==`);
const busyBatches = [];
for (let index = 0; index < PASSAGES; index += BATCH) busyBatches.push(backfillInputs.slice(index, index + BATCH));
let busyDone = 0;
const busyStarted = performance.now();
const busyLat = [];
let querying = true;
const backfillPromise = Promise.all(
	Array.from({ length: CONC }, async () => {
		for (;;) {
			const batch = busyBatches.shift();
			if (!batch) return;
			await embed(batch);
			busyDone += 1;
		}
	}),
);
const queryLoop = (async () => {
	let index = 0;
	while (querying) {
		const input = questions[index % questions.length];
		index += 1;
		const started = performance.now();
		await embed([input]);
		busyLat.push(performance.now() - started);
	}
})();
await backfillPromise;
querying = false;
await queryLoop;
const busyMs = performance.now() - busyStarted;
const sortedBusy = [...busyLat].sort((a, b) => a - b);
console.log(
	`query under load: p50=${fmt(pct(sortedBusy, 50))} ms  p95=${fmt(pct(sortedBusy, 95))} ms  ` +
		`n=${busyLat.length}  (the backfill of the same run: ${fmt(chunksPerSecond, 2)} chunks/s, ` +
		`${fmt(busyMs / 1000)} s)`,
);

const report = {
	base: BASE,
	style: STYLE,
	model: MODEL,
	queries: QUERIES,
	passages: PASSAGES,
	backfillPassages: passagesDone,
	batch: BATCH,
	concurrency: CONC,
	corpusChunks: passages.length,
	queryP50: pct(sortedQuery, 50),
	queryP95: pct(sortedQuery, 95),
	queryP99: pct(sortedQuery, 99),
	queryMean: mean(queryLat),
	backfillS: backfillMs / 1000,
	chunksPerSecond,
	queryUnderLoadP50: pct(sortedBusy, 50),
	queryUnderLoadP95: pct(sortedBusy, 95),
	queryUnderLoadN: busyLat.length,
};
const text = JSON.stringify(report, null, 2);
if (process.env.OUT) {
	writeFileSync(process.env.OUT, `${text}\n`);
	console.log(`\n${JSON.stringify(report)}`);
} else {
	console.log(text);
}
process.exit(0);

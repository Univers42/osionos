/* ************************************************************************** */
/*                                                                            */
/*   measure.mjs                         the measurement of the indexer       */
/*                                                                            */
/*   Two phases, the same query load in both:                                */
/*                                                                            */
/*     1. the baseline: the query load alone, with no backfill. The query    */
/*        embeddings are the ones a user asks for while the assistant        */
/*        answers: one every 100 ms, sixteen in flight at the same time (the */
/*        concurrency the P0c spike measured).                                */
/*     2. the backfill: the same query load, while the corpus is indexed.    */
/*                                                                            */
/*   It prints one JSON line: the chunks per second of the backfill, the     */
/*   percentiles of the query embeddings in the two phases, and the load      */
/*   average of the host next to them.                                       */
/*                                                                            */
/*   The indexer under test is given by AI_IDX_WORKER: the module of the     */
/*   worker, so the same measurement runs the indexer of the branch and the  */
/*   indexer of feat/ai (the "before").                                       */
/*                                                                            */
/*   No dependencies beyond the service's own. Node 22.                      */
/* ************************************************************************** */

import console from "node:console";
import process from "node:process";
import { readFileSync } from "node:fs";
import { setTimeout } from "node:timers";
import { Pool } from "pg";
import { readGolden } from "../../eval/lib.mjs";

const databaseUrl = process.env.AI_IDX_DATABASE_URL ?? "";
const embedUrl = process.env.AI_IDX_EMBED_URL ?? "";
// The embedder of the BULK work: its own service when the deployment runs
// one, the query service otherwise (the same fallback as the indexer's).
const bulkUrl = process.env.AI_IDX_EMBED_BULK_URL || embedUrl;
const workerModule = process.env.AI_IDX_WORKER ?? "../../src/indexer/worker.ts";
const label = process.env.AI_IDX_LABEL ?? "run";
const queriesWanted = Number(process.env.AI_IDX_QUERIES ?? 200);
const queryEveryMs = Number(process.env.AI_IDX_QUERY_EVERY_MS ?? 100);
const queryInFlight = Number(process.env.AI_IDX_QUERY_IN_FLIGHT ?? 16);

const { IndexerWorker } = await import(workerModule);
const { Embedder } = await import("../../src/indexer/embedder.ts");

/** A number of the environment, or nothing when it is not one. */
function numberEnv(name) {
	const raw = process.env[name];
	if (raw === undefined || raw.trim().length === 0) return undefined;
	const value = Number(raw);
	return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** The sleep of a millisecond. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The load average of the host: the container shares it. */
function loadavg() {
	const raw = readFileSync("/proc/loadavg", "utf8").split(" ");
	return { one: Number(raw[0]), five: Number(raw[1]), fifteen: Number(raw[2]) };
}

/** A percentile, nearest rank. */
function percentile(values, fraction) {
	if (values.length === 0) return null;
	const sorted = [...values].sort((left, right) => left - right);
	const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
	return sorted[rank];
}

const pool = new Pool({ connectionString: databaseUrl, max: 16 });
const MODEL = "intfloat/multilingual-e5-small";
// The queries go to the query service, the indexer to the bulk one.
const embedder = new Embedder({ baseUrl: embedUrl, model: MODEL });
const bulkEmbedder = new Embedder({ baseUrl: bulkUrl, model: MODEL });

// The questions of the golden set: the queries of the load.
const questions = readGolden().map((question) => String(question.question ?? ""));

/**
 * The query load: one query every 100 ms, sixteen in flight at the same time.
 *
 * The latencies are the ones of the service: a query that is issued while
 * sixteen others are in flight waits for its turn, and that wait is what the
 * percentiles measure.
 */
async function queryLoad(count, latencies, running) {
	let issued = 0;
	const inFlight = new Set();
	while (issued < count && running()) {
		const text = questions[issued % Math.max(1, questions.length)] || "a question";
		issued += 1;
		const started = Date.now();
		const call = embedder
			.embed([embedder.queryInput(text)])
			.then(() => {
				latencies.push(Date.now() - started);
			})
			.catch(() => {
				latencies.push(-1);
			})
			.finally(() => {
				inFlight.delete(call);
			});
		inFlight.add(call);
		// The load never goes above the concurrency of the protocol: a query
		// that would exceed it waits for a slot.
		while (inFlight.size >= queryInFlight) await Promise.race(inFlight);
		await sleep(queryEveryMs);
	}
	await Promise.all(inFlight);
	return issued;
}

/** The percentiles of a phase. */
function summary(latencies) {
	const good = latencies.filter((value) => value >= 0);
	return {
		queries: latencies.length,
		failed: latencies.length - good.length,
		p50: percentile(good, 0.5),
		p95: percentile(good, 0.95),
		p99: percentile(good, 0.99),
		max: good.length > 0 ? Math.max(...good) : null,
	};
}

// The queue before the run: the rows are the lanes of the backfill. The old
// migration has no lane, and the queue of the "before" run has no priority.
const queued = await pool.query("select count(*)::int as rows from public.ai_index_queue");
let lanes = null;
try {
	const found = await pool.query(
		"select min(priority)::int as min_priority, max(priority)::int as max_priority from public.ai_index_queue",
	);
	lanes = found.rows[0];
} catch {
	lanes = null;
}
const pages = await pool.query("select count(*)::int as rows from public.osionos_pages");

// 1. The baseline: the query load alone.
const baselineLatencies = [];
let running = true;
const loadBefore = loadavg();
const baselineStarted = Date.now();
const baselineIssued = await queryLoad(queriesWanted, baselineLatencies, () => running);
const baselineMs = Date.now() - baselineStarted;
const loadBaseline = loadavg();

// 2. The backfill, with the same query load.
const indexed = { pages: 0, chunks: 0, embedded: 0, writeMs: 0 };
const worker = new IndexerWorker({
	pool,
	embedder: bulkEmbedder,
	databaseUrl,
	// The debounce is off: the measurement is about the throughput, not about
	// the ten seconds a page waits after its last edit.
	debounceSeconds: 0,
	// The knobs of the AIMD controller, when the run gives them.
	embedTargetMs: numberEnv("OSIONOS_AI_EMBED_TARGET_MS"),
	embedMaxConcurrency: numberEnv("OSIONOS_AI_EMBED_MAX_CONCURRENCY"),
	embedTokenBudget: numberEnv("OSIONOS_AI_EMBED_TOKEN_BUDGET"),
	log: (entry) => {
		if (entry.event === "indexed") {
			indexed.pages += 1;
			indexed.chunks += Number(entry.chunks ?? 0);
			indexed.embedded += Number(entry.embedded ?? 0);
			indexed.writeMs += Number(entry.ms ?? 0);
		}
	},
});

const backfillLatencies = [];
const loadStarted = Date.now();
await worker.start();
const backfillLoad = queryLoad(queriesWanted, backfillLatencies, () => running);

// The backfill is over when the queue is empty.
for (;;) {
	const pending = await pool.query("select count(*)::int as n from public.ai_index_queue");
	if ((pending.rows[0]?.n ?? 0) === 0) break;
	if (Date.now() - loadStarted > 900000) throw new Error("the queue did not empty in 15 minutes");
	await sleep(100);
}
const elapsed = Date.now() - loadStarted;
running = false;
await backfillLoad;
await worker.stop();
const loadAfter = loadavg();

const report = {
	label,
	worker: workerModule,
	queryEmbedUrl: embedUrl,
	bulkEmbedUrl: bulkUrl,
	queueBefore: { ...queued.rows[0], ...(lanes ?? {}) },
	pagesBefore: pages.rows[0]?.rows ?? 0,
	indexedPages: indexed.pages,
	chunks: indexed.chunks,
	embedded: indexed.embedded,
	writeMs: indexed.writeMs,
	elapsedMs: elapsed,
	chunksPerSecond: Number((indexed.chunks / (elapsed / 1000)).toFixed(2)),
	baseline: { ...summary(baselineLatencies), issued: baselineIssued, ms: baselineMs },
	backfill: summary(backfillLatencies),
	loadavgBefore: loadBefore,
	loadavgBaseline: loadBaseline,
	loadavgAfter: loadAfter,
};
console.log(JSON.stringify(report));
await pool.end();

// The summary of an embedding measurement: the JSON of the benchmark, and the
// line of the table of the report.
//
//   node summarize-embed.mjs <bench.json> <label> >> results/part-b.jsonl
//
// Two shapes are understood: the benchmark of the embedder (query p95,
// backfill) and the agreement of the two embedders (the cosine).
//
// No dependencies. Node 22.

import { readFileSync } from 'node:fs';

const [, , benchFile, label] = process.argv;
const bench = JSON.parse(readFileSync(benchFile, 'utf8'));

const round = (value, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);
// The load average that opened the measurement (the brief wants it next to
// every number).
const loadavg = Number(process.env.LOADAVG);
const load = Number.isFinite(loadavg) && loadavg > 0 ? loadavg : null;

// The agreement of the two embedders.
if (bench.passages && bench.questions && bench.passages.mean !== undefined) {
	console.log(
		JSON.stringify({
			label: label ?? 'agreement',
			kind: 'agreement',
			chunks: bench.passages.n,
			chunkCosineMean: round(bench.passages.mean, 6),
			chunkCosineMin: round(bench.passages.min, 6),
			chunkCosineP05: round(bench.passages.p05, 6),
			questions: bench.questions.n,
			questionCosineMean: round(bench.questions.mean, 6),
			questionCosineMin: round(bench.questions.min, 6),
			questionCosineP05: round(bench.questions.p05, 6),
			dimensions: bench.passages.dim,
			loadavgStart: load,
		}),
	);
	process.exit(0);
}

// The benchmark of the embedder.
console.log(
	JSON.stringify({
		label: label ?? 'embed',
		kind: 'embed',
		base: bench.base,
		style: bench.style,
		model: bench.model,
		queries: bench.queries,
		passages: bench.passages,
		batch: bench.batch,
		concurrency: bench.concurrency,
		corpusChunks: bench.corpusChunks,
		queryP50: round(bench.queryP50),
		queryP95: round(bench.queryP95),
		queryP99: round(bench.queryP99),
		chunksPerSecond: round(bench.chunksPerSecond),
		backfillS: round(bench.backfillS, 1),
		queryUnderLoadP50: round(bench.queryUnderLoadP50),
		queryUnderLoadP95: round(bench.queryUnderLoadP95),
		queryUnderLoadN: bench.queryUnderLoadN,
		loadavgStart: load,
	}),
);

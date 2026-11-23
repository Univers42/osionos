// osionos#240 M240-4: the worst single parse of POST /api/pages/from-markdown at its 64 KiB
// cap, timed on the committed bundle (the code the bridge runs): the 37 ruling shapes plus a
// seeded fuzz run, each document parsed RUNS times and its slowest run kept. Fails above
// BUDGET_MS. One line per document, then a summary line, go to the JSONL artifact.
// Usage: node tests/bench/markdown-import/bench.mjs [--out tests/bench/markdown-import/results.jsonl]
// Caveat: wall-clock on a shared box inside Docker; a busy neighbour inflates a time (a false
// failure, never a false pass). Re-run once before acting on a red result. The corpus limits
// are the corpus's own (tests/fixtures/markdown-import/corpus.mjs).

import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { markdownImportBlocks } from '../../../scripts/bridge-markdown-engine.mjs';
import { MARKDOWN_MAX_BYTES } from '../../../scripts/bridge-pages-from-markdown.mjs';
import { fuzzDocument, SHAPES } from '../../fixtures/markdown-import/corpus.mjs';

const BUDGET_MS = 50;
const RUNS = 3;
const FUZZ_DOCS = 200;
const FUZZ_SEED = 240;

/** The longest prefix of `text` within the cap in UTF-8 bytes, as the route admits it. */
function atCap(text) {
	let end = Math.min(text.length, MARKDOWN_MAX_BYTES);
	while (Buffer.byteLength(text.slice(0, end), 'utf8') > MARKDOWN_MAX_BYTES) end -= 1;
	return text.slice(0, end);
}

/** The corpus: every shape at the cap, then fuzz documents whose lengths climb to the cap. */
function documents() {
	const shapes = Object.entries(SHAPES).map(([name, make]) => [`shape:${name}`, atCap(make(MARKDOWN_MAX_BYTES * 2))]);
	const seedState = { seed: FUZZ_SEED };
	const fuzz = Array.from({ length: FUZZ_DOCS }, (_, index) => [`fuzz:${index}`, atCap(fuzzDocument(seedState, Math.ceil(MARKDOWN_MAX_BYTES * (index + 1) / FUZZ_DOCS)))]);
	return [...shapes, ...fuzz];
}

function slowestRun(markdown) {
	let slowest = 0;
	let blocks = 0;
	for (let run = 0; run < RUNS; run += 1) {
		const started = performance.now();
		blocks = markdownImportBlocks(markdown).length;
		slowest = Math.max(slowest, performance.now() - started);
	}
	return { ms: Math.round(slowest * 100) / 100, blocks };
}

const outIndex = process.argv.indexOf('--out');
const outPath = outIndex === -1 ? null : process.argv[outIndex + 1];
markdownImportBlocks('# warm\n\n- a *b* [c](d)\n');
const lines = [];
let worst = { name: null, ms: 0 };
for (const [name, markdown] of documents()) {
	const { ms, blocks } = slowestRun(markdown);
	lines.push({ name, bytes: Buffer.byteLength(markdown, 'utf8'), ms, blocks });
	if (ms > worst.ms) worst = { name, ms };
}
const summary = { summary: true, documents: lines.length, runsPerDocument: RUNS, worstMs: worst.ms, worstDocument: worst.name, budgetMs: BUDGET_MS, node: process.version, pass: worst.ms <= BUDGET_MS };
if (outPath) writeFileSync(outPath, [...lines, summary].map((line) => JSON.stringify(line)).join('\n') + '\n');
console.log(JSON.stringify(summary));
process.exitCode = summary.pass ? 0 : 1;

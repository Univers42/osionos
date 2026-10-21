// The tables of the report, from the JSON lines of the runs.
//
//   node table.mjs part-a [part-b] [part-c]
//   PREFIX=3-vk node table.mjs part-a
//
// No dependencies. Node 22.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(HERE, 'results');

const files = process.argv.slice(2);
const filter = process.env.PREFIX || '';
const rows = [];
for (const file of files) {
	const full = path.join(RESULTS, `${file}.jsonl`);
	if (!existsSync(full)) continue;
	for (const line of readFileSync(full, 'utf8').split('\n')) {
		if (!line.trim()) continue;
		try {
			const row = JSON.parse(line);
			if (filter && !String(row.label).startsWith(filter)) continue;
			rows.push(row);
		} catch {
			/* the "does not fit" lines are not JSON objects of the run */
		}
	}
}

const DASH = '-';
const fmt = (value, digits = 0) => (value === null || value === undefined ? DASH : Number(value).toFixed(digits));

console.log('| run | sent | ok | backlog | err | TTFT p50 | TTFT p95 | ITL p50 | ITL p95 | E2E p50 | E2E p95 | tok/s | cache_n | prompt_n | deferred | VRAM peak GiB | busy % | loadavg start | loadavg end |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const row of rows) {
	if (row.fits === false) {
		console.log(`| ${row.label} | ${DASH} | ${DASH} | ${DASH} | ${DASH} | ${DASH} | ${DASH} | ${DASH} | ${DASH} | ${DASH} | ${DASH} | ${DASH} | ${DASH} | ${DASH} | ${DASH} | ${row.vramAfter} B | ${DASH} | ${DASH} | ${DASH} |`);
		continue;
	}
	const line = [
		row.label,
		row.sent ?? DASH,
		row.ok,
		row.backlog ?? DASH,
		row.errors ?? DASH,
		fmt(row.ttftP50),
		fmt(row.ttftP95),
		fmt(row.itlP50, 1),
		fmt(row.itlP95, 1),
		fmt(row.e2eP50),
		fmt(row.e2eP95),
		fmt(row.aggregateTokPerS, 2),
		fmt(row.cacheNMean),
		fmt(row.promptNMean),
		row.peakDeferred ?? DASH,
		`${fmt(row.peakVramGiB, 2)}${row.overVramLimit ? ' OVER' : ''}`,
		fmt(row.gpuBusyMean, 1),
		row.loadavgStart ?? DASH,
		row.loadavg ?? DASH,
	].join(' | ');
	console.log(`| ${line} |`);
}

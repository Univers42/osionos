// The summary of one measurement: the JSON of the benchmark, the peak VRAM of
// the sampler, the load average, and the line of the table of the report.
//
//   node summarize.mjs <bench.json> <sampler.txt> <label> [loadavg.txt]
//
// No dependencies. Node 22.

import { readFileSync } from 'node:fs';

// The rule of the brief: the VRAM of the card never goes above 7.4 GiB.
const VRAM_LIMIT = 7946554000;

const [, , benchFile, samplerFile, label, loadavgFile] = process.argv;
const bench = JSON.parse(readFileSync(benchFile, 'utf8'));

let peakVram = 0;
let busySum = 0;
let busyCount = 0;
let loadavg = 0;
let samples = 0;
try {
	const lines = readFileSync(samplerFile, 'utf8').trim().split('\n').filter(Boolean);
	for (const line of lines) {
		const [, vram, busy, load] = line.split(' ');
		const vramNumber = Number(vram);
		const busyNumber = Number(busy);
		if (Number.isFinite(vramNumber)) peakVram = Math.max(peakVram, vramNumber);
		if (Number.isFinite(busyNumber)) {
			busySum += busyNumber;
			busyCount += 1;
		}
		if (Number.isFinite(Number(load))) loadavg = Number(load);
		samples += 1;
	}
} catch {
	/* no sampler file: the numbers of the sample stay at zero */
}

// The load average that opened the configuration (the brief wants it next to
// every number).
let loadavgStart = null;
try {
	const value = Number(readFileSync(loadavgFile, 'utf8').trim());
	if (Number.isFinite(value)) loadavgStart = value;
} catch {
	/* no loadavg file */
}

const round = (value, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);

console.log(
	JSON.stringify({
		label: label ?? bench.label,
		lambda: bench.lambda,
		ok: bench.ok,
		errors: bench.errors?.length ?? 0,
		ttftP50: round(bench.ttftP50),
		ttftP95: round(bench.ttftP95),
		itlP50: round(bench.itlP50),
		itlP95: round(bench.itlP95),
		e2eP50: round(bench.e2eP50),
		e2eP95: round(bench.e2eP95),
		aggregateTokPerS: round(bench.aggregateTokPerS),
		serverDecodeTokPerS: round(bench.serverDecodeTokPerS),
		promptNMean: round(bench.promptNMean),
		cacheNMean: round(bench.cacheNMean),
		peakDeferred: bench.peakDeferred,
		peakProcessing: bench.peakProcessing,
		specDraftTokens: bench.specDraftTokens,
		specAcceptedTokens: bench.specAcceptedTokens,
		peakVram: peakVram,
		peakVramGiB: round(peakVram / 1073741824, 3),
		vramLimit: VRAM_LIMIT,
		overVramLimit: peakVram > VRAM_LIMIT,
		gpuBusyMean: busyCount ? round(busySum / busyCount, 1) : null,
		loadavg: loadavg || null,
		loadavgStart,
		samples,
	}),
);

// The LLM benchmark of the GPU spike (AI-P0d, Part A).
//
// One run: a Poisson arrival process at LAMBDA requests per second for
// DURATION seconds, every request a streamed chat completion with the prompt
// the service sends (see requests.mjs). It measures:
//
//   - the time to the first token (TTFT), p50 and p95;
//   - the inter-token latency (ITL), p50 and p95: the gap between two
//     consecutive content chunks of the same stream;
//   - the end-to-end time, p50 and p95;
//   - the aggregate output tokens per second of the whole window;
//   - the prompt tokens the server reused from its cache (timings.cache_n)
//     against the prompt tokens it had to read (timings.prompt_n);
//   - the requests the server deferred (llamacpp:requests_deferred, polled
//     once a second, the peak kept).
//
// Protocol (fixed, never re-tuned to pass): the same prompt for every
// configuration, the same arrival process, the same seed.
//
//   node llm-bench-gpu.mjs > one-run.json
//   node llm-bench-gpu.mjs --base-url https://host/v1 --model ID --n 20 --auth-file H [--plain]
//
// Flags (bench-args.mjs): --base-url, --model, --n, --auth-file. --n sends exactly
// N requests (sequential, or Poisson when LAMBDA is set) instead of a DURATION window.
// The first content part (content, reasoning or tool call; R20) is reported next to
// the first content token, with the success rate and the runs that streamed reasoning.
//
// Caveat: on a shared GPU or a remote free tier the numbers move with the
// neighbours, and a small n makes p95 the slowest run. Read n beside them.
//
// Env:
//   LLM_URL      the base url of the llama.cpp server (default http://127.0.0.1:18080)
//   LAMBDA       the arrival rate, requests per second (default 1)
//   DURATION     the length of the window, seconds (default 60)
//   MAX_TOKENS   the tokens of one answer (default 300)
//   MODEL        the model id (default: read from /v1/models)
//   REQUESTS     how many different prompts to cycle (default 24)
//   RANDOMIZE_PREFIX  1 defeats the prefix cache (default 0)
//   LABEL        the name of the run, for the report
//   READY_FILE   optional marker present only during the arrival window
//   OUT          a file to write the JSON to (default: stdout)

import { unlinkSync, writeFileSync } from 'node:fs';
import { buildRequests } from './requests.mjs';
import { parseArgs } from './bench-args.mjs';
import { buildBody } from './bench-body.mjs';
import { runOne as runStream } from './stream-run.mjs';
import { readMetrics } from './server-metrics.mjs';
import { fmt, mean, mulberry32, pct } from './stream-stats.mjs';

const ARGS = parseArgs(process.argv.slice(2), process.env);
const { api: API, root: BASE, n: N } = ARGS;
const metrics = () => (ARGS.remote ? Promise.resolve({}) : readMetrics(BASE));
const LAMBDA = Number(process.env.LAMBDA || 1);
const DURATION = Number(process.env.DURATION || 60);
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 300);
const REQUESTS = Number(process.env.REQUESTS || 24);
const RANDOMIZE = process.env.RANDOMIZE_PREFIX === '1';
const LABEL = process.env.LABEL || 'run';
const SEED = Number(process.env.SEED || 20261021);

const rng = mulberry32(SEED);

/** One streamed chat completion, timed (stream-run.mjs). */
const runOne = (body) => runStream(body, {
	api: API,
	headers: ARGS.headers,
	timeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 180000),
});

// ---------------------------------------------------------------- start
const MODEL = ARGS.model || (await (await fetch(`${API}/models`, { headers: ARGS.headers })).json()).data?.[0]?.id;
if (!MODEL) {
	console.error(`no model at ${API}/models`);
	process.exit(1);
}

const { requests } = buildRequests({ count: REQUESTS, randomizePrefix: RANDOMIZE });
const bodyOf = (request) =>
	buildBody({ model: MODEL, request, maxTokens: MAX_TOKENS, remote: ARGS.remote, plain: ARGS.plain });

// The warm-up: two requests, discarded. The service is always running, so
// the model is loaded and the prompt cache is warm before the window opens.
for (let index = 0; index < ARGS.warmups; index += 1) {
	const warm = await runOne(bodyOf(requests[0]));
	if (warm.error) {
		console.error(`warm-up failed: ${warm.error}`);
		process.exit(1);
	}
}

const before = await metrics();
const peak = { deferred: before['llamacpp:requests_deferred'] ?? 0, processing: 0 };
let polling = true;
const poll = async () => {
	const current = await metrics();
	if (current['llamacpp:requests_deferred'] !== undefined) {
		peak.deferred = Math.max(peak.deferred, current['llamacpp:requests_deferred']);
	}
	if (current['llamacpp:requests_processing'] !== undefined) {
		peak.processing = Math.max(peak.processing, current['llamacpp:requests_processing']);
	}
};
const poller = (async () => {
	while (polling) {
		await poll();
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
})();

if (process.env.READY_FILE) writeFileSync(process.env.READY_FILE, 'ready\n');

// The window: the arrivals are Poisson, the seed is fixed.
const results = [];
const started = performance.now();
let nextAt = 0;
let index = 0;
let sent = 0;
const inflight = [];
while (true) {
	const elapsed = (performance.now() - started) / 1000;
	if (N === null ? elapsed >= DURATION : sent >= N) break;
	const sequential = N !== null && !ARGS.lambdaGiven;
	if (nextAt === 0) nextAt = elapsed;
	const wait = sequential ? 0 : nextAt - elapsed;
	if (wait > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(wait, 100) * 1000));
	nextAt += -Math.log(1 - rng()) / LAMBDA;
	const request = requests[index % requests.length];
	index += 1;
	sent += 1;
	inflight.push(
		runOne(bodyOf(request)).then((result) => {
			results.push({ id: request.id, ...result });
		}),
	);
	if (sequential) await inflight[inflight.length - 1];
}
const windowEnd = performance.now();
if (process.env.READY_FILE) unlinkSync(process.env.READY_FILE);
// The drain: the window is over, but the requests that are still running are
// waited for, at most DRAIN_MS. A server that cannot keep up leaves a backlog,
// and the backlog is the answer, not a reason to wait for minutes.
const DRAIN_MS = Number(process.env.DRAIN_MS || 60000);
let finished = 0;
const counted = inflight.map((promise) => promise.then(() => { finished += 1; }));
await Promise.race([
	Promise.all(counted),
	new Promise((resolve) => setTimeout(resolve, DRAIN_MS)),
]);
// The backlog: the requests that were sent and were still running when the
// drain ended. The server is behind.
const unfinished = sent - finished;
const ended = performance.now();
polling = false;
await poller;
// ---------------------------------------------------------------- summary
const ok = results.filter((r) => !r.error);
const firstParts = ok.map((r) => r.firstPartMs).filter(Number.isFinite).sort((a, b) => a - b);
const ttfts = ok.map((r) => r.ttftMs).filter(Number.isFinite).sort((a, b) => a - b);
const e2e = ok.map((r) => r.totalMs).filter(Number.isFinite).sort((a, b) => a - b);
const itls = ok.flatMap((r) => r.itlMs).sort((a, b) => a - b);
const promptN = ok.map((r) => r.timings?.prompt_n).filter((v) => Number.isFinite(v));
const cacheN = ok.map((r) => r.timings?.cache_n).filter((v) => Number.isFinite(v));
const predictedN = ok.map((r) => r.timings?.predicted_n ?? r.usage?.completion_tokens).filter((v) => Number.isFinite(v));
const after = await metrics();

const report = {
	label: LABEL,
	base: BASE,
	model: MODEL,
	lambda: LAMBDA,
	durationS: DURATION,
	maxTokens: MAX_TOKENS,
	requests: REQUESTS,
	randomizePrefix: RANDOMIZE,
	seed: SEED,
	arrivals: sent,
	sent,
	ok: ok.length,
	backlog: unfinished,
	errors: results.filter((r) => r.error).map((r) => r.error),
	n: sent,
	successRate: sent === 0 ? NaN : ok.length / sent,
	reasoningRuns: ok.filter((r) => r.sawReasoning).length,
	firstPartP50: pct(firstParts, 50),
	firstPartP95: pct(firstParts, 95),
	ttftP50: pct(ttfts, 50),
	ttftP95: pct(ttfts, 95),
	itlP50: pct(itls, 50),
	itlP95: pct(itls, 95),
	e2eP50: pct(e2e, 50),
	e2eP95: pct(e2e, 95),
	itlSamples: itls.length,
	wallS: (ended - started) / 1000,
	windowS: (windowEnd - started) / 1000,
	completionTokens: predictedN.reduce((a, b) => a + b, 0),
	promptTokens: promptN.reduce((a, b) => a + b, 0),
	cacheTokens: cacheN.reduce((a, b) => a + b, 0),
	promptNMean: mean(promptN),
	cacheNMean: mean(cacheN),
	predictedNMean: mean(predictedN),
	aggregateTokPerS: predictedN.reduce((a, b) => a + b, 0) / ((ended - started) / 1000),
	serverDecodeTokPerS: mean(ok.map((r) => r.timings?.predicted_per_second).filter((v) => Number.isFinite(v))),
	serverPromptTokPerS: mean(ok.map((r) => r.timings?.prompt_per_second).filter((v) => Number.isFinite(v))),
	peakDeferred: peak.deferred,
	peakProcessing: peak.processing,
	metricsBefore: before,
	metricsAfter: after,
	specDraftTokens: after['llamacpp:spec_decode_num_draft_tokens_total'] ?? 0,
	specAcceptedTokens: after['llamacpp:spec_decode_num_accepted_tokens_total'] ?? 0,
};

const text = JSON.stringify(report, null, 2);
if (process.env.OUT) {
	writeFileSync(process.env.OUT, `${text}\n`);
	console.log(
		`${LABEL} lambda=${LAMBDA} n=${report.ok}/${sent} success=${fmt(report.successRate)} first-part p50=${fmt(report.firstPartP50)} p95=${fmt(report.firstPartP95)} reasoning=${report.reasoningRuns} ttft p50=${fmt(report.ttftP50)} p95=${fmt(report.ttftP95)} ` +
			`itl p50=${fmt(report.itlP50)} p95=${fmt(report.itlP95)} e2e p50=${fmt(report.e2eP50)} p95=${fmt(report.e2eP95)} ` +
			`agg=${fmt(report.aggregateTokPerS)} tok/s cache=${report.cacheNMean}/${fmt(report.promptNMean)} ` +
			`deferredPeak=${report.peakDeferred} errors=${report.errors.length}`,
	);
} else {
	console.log(text);
}
// The metrics poller is stopped, but the process must not wait for the
// timers of the event loop: the run of the benchmark is over.
process.exit(0);

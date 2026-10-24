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

const BASE = (process.env.LLM_URL || 'http://127.0.0.1:18080').replace(/\/$/, '');
const LAMBDA = Number(process.env.LAMBDA || 1);
const DURATION = Number(process.env.DURATION || 60);
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 300);
const REQUESTS = Number(process.env.REQUESTS || 24);
const RANDOMIZE = process.env.RANDOMIZE_PREFIX === '1';
const LABEL = process.env.LABEL || 'run';
const SEED = Number(process.env.SEED || 20261021);

// ---------------------------------------------------------------- helpers
function mulberry32(a) {
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		a = Math.imul(a ^ (a >>> 15), 1 | a);
		a = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a;
		return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
	};
}
const rng = mulberry32(SEED);

/** The percentile of a sorted list, nearest rank (the convention of P0a/P0c). */
function pct(sorted, p) {
	if (sorted.length === 0) return NaN;
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
	return sorted[index];
}
const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : 'n/a');
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

async function* sseObjects(res) {
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let index;
			while ((index = buffer.search(/\r?\n\r?\n/)) !== -1) {
				const block = buffer.slice(0, index);
				buffer = buffer.slice(index + (buffer[index] === '\r' ? 4 : 2));
				if (/^event:\s*error\s*$/m.test(block)) { yield { error: block }; continue; }
				for (const line of block.split('\n')) {
					const text = line.trim();
					if (!text.startsWith('data:')) continue;
					const payload = text.slice(5).trim();
					if (payload === '[DONE]') { yield { done: true }; continue; }
					try {
						const parsed = JSON.parse(payload);
						yield parsed;
					} catch {
						/* keepalive */
					}
				}
			}
		}
	} finally {
		await reader.cancel().catch(() => undefined);
		reader.releaseLock();
	}
}

/** One streamed chat completion, timed. */
async function runOne(body) {
	const started = performance.now();
	let res;
	try {
		res = await fetch(`${BASE}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(Number(process.env.REQUEST_TIMEOUT_MS || 180000)),
		});
	} catch (error) {
		return { error: `fetch_failed: ${error.message}` };
	}
	if (!res.ok) {
		const text = await res.text();
		return { error: `http_${res.status}: ${text.slice(0, 300)}` };
	}
	let firstAt = null;
	let lastAt = null;
	let contentChunks = 0;
	let contentChars = 0;
	let timings = null;
	let usage = null;
	let finishReason = null;
	const contentTimes = [];
	let completed = false;
	try {
		for await (const object of sseObjects(res)) {
			if (object?.error !== undefined) return { error: `stream_error: ${JSON.stringify(object.error).slice(0, 300)}` };
			if (object.done) completed = true;
			const now = performance.now();
			if (object.timings) timings = object.timings;
			if (object.usage) usage = object.usage;
			const choice = object.choices?.[0];
			if (!choice) continue;
			if (choice.finish_reason) { finishReason = choice.finish_reason; completed = true; }
			const delta = choice.delta?.content;
			if (typeof delta === 'string' && delta.length > 0) {
				if (firstAt === null) firstAt = now;
				contentTimes.push(now);
				contentChunks += 1;
				contentChars += delta.length;
				lastAt = now;
			}
		}
	} catch (error) {
		return { error: `stream_failed: ${error.message}` };
	}
	if (!completed) return { error: 'stream_incomplete: ended without completion' };
	const ended = performance.now();
	const itl = [];
	for (let index = 1; index < contentTimes.length; index += 1) itl.push(contentTimes[index] - contentTimes[index - 1]);
	return {
		ttftMs: firstAt === null ? NaN : firstAt - started,
		totalMs: ended - started,
		itlMs: itl,
		contentChunks,
		contentChars,
		finishReason,
		timings,
		usage,
	};
}

/** The metrics of the server, as a flat object of numbers. */
async function metrics() {
	try {
		const res = await fetch(`${BASE}/metrics`);
		if (!res.ok) return {};
		const text = await res.text();
		const out = {};
		for (const line of text.split('\n')) {
			if (!line.startsWith('llamacpp:')) continue;
			const space = line.indexOf(' ');
			if (space === -1) continue;
			const value = Number(line.slice(space + 1));
			if (Number.isFinite(value)) out[line.slice(0, space)] = value;
		}
		return out;
	} catch {
		return {};
	}
}

// ---------------------------------------------------------------- start
const models = await (await fetch(`${BASE}/v1/models`)).json();
const MODEL = process.env.MODEL || models.data?.[0]?.id;
if (!MODEL) {
	console.error(`no model at ${BASE}/v1/models`);
	process.exit(1);
}

const { requests } = buildRequests({ count: REQUESTS, randomizePrefix: RANDOMIZE });
const bodyOf = (request) => ({
	model: MODEL,
	messages: request.messages,
	tools: request.tools,
	tool_choice: 'auto',
	stream: true,
	stream_options: { include_usage: true },
	max_tokens: MAX_TOKENS,
	temperature: 0,
	cache_prompt: true,
});

// The warm-up: two requests, discarded. The service is always running, so
// the model is loaded and the prompt cache is warm before the window opens.
for (let index = 0; index < 2; index += 1) {
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
	if (elapsed >= DURATION) break;
	if (nextAt === 0) nextAt = elapsed;
	const wait = nextAt - elapsed;
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
const ttfts = ok.map((r) => r.ttftMs).filter(Number.isFinite).sort((a, b) => a - b);
const e2e = ok.map((r) => r.totalMs).filter(Number.isFinite).sort((a, b) => a - b);
const itls = ok.flatMap((r) => r.itlMs).sort((a, b) => a - b);
const promptN = ok.map((r) => r.timings?.prompt_n).filter((v) => Number.isFinite(v));
const cacheN = ok.map((r) => r.timings?.cache_n).filter((v) => Number.isFinite(v));
const predictedN = ok.map((r) => r.timings?.predicted_n).filter((v) => Number.isFinite(v));
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
		`${LABEL} lambda=${LAMBDA} n=${report.ok} ttft p50=${fmt(report.ttftP50)} p95=${fmt(report.ttftP95)} ` +
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

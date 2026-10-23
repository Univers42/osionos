import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';

interface SeedRow {
	userId: string;
	workspaceId: string;
	token: string;
	conversations: string[];
}

const TOKENS_PATH = process.env.TOKENS_PATH ?? '/home/dlesieur/wt-ai-night/tmp/load-tokens.json';
const RUNS_PATH = process.env.RUNS_PATH ?? '/home/dlesieur/wt-ai-night/tmp/load-runs.jsonl';
const SERVICE_URL = process.env.SERVICE_URL ?? 'http://service:4300';
const SHARED_DIR = process.env.LOAD_SHARED_DIR ?? '/home/dlesieur/wt-ai-night/tmp';
const PROFILE_SECONDS = Number(process.env.PROFILE_SECONDS ?? 600);
const STEP_SECONDS = Number(process.env.STEP_SECONDS ?? 180);
const RATE = Number(process.env.PROFILE_RATE ?? 3.5);

const users = JSON.parse(readFileSync(TOKENS_PATH, 'utf8')) as SeedRow[];

// Capture host loadavg at the start of the run.
writeFileSync(`${SHARED_DIR}/load-loadavg-start.json`, JSON.stringify(os.loadavg()));

function mulberry32(seed: number): () => number {
	let t = seed >>> 0;
	return () => {
		t += 0x6d2b79f5;
		let x = t;
		x = Math.imul(x ^ (x >>> 15), x | 1);
		x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
		return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
	};
}

const rng = mulberry32(42);

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickUser(): SeedRow {
	return users[Math.floor(rng() * users.length)];
}

interface RunRecord {
	phase: string;
	step: string;
	t0: number;
	t_first: number | null;
	t_done: number;
	httpStatus: number;
	status: number;
	errorCode: string | null;
	overheadMs: number | null;
	durationMs: number;
}

async function runOnce(phase: string, step: string): Promise<RunRecord> {
	const user = pickUser();
	const runId = randomUUID();
	const convId = user.conversations[Math.floor(rng() * user.conversations.length)];
	const t0 = performance.now();
	let tFirst: number | null = null;
	let tDone = t0;
	let httpStatus = 0;
	let errorCode: string | null = null;

	try {
		const res = await fetch(`${SERVICE_URL}/api/ai/runs`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${user.token}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify({ runId, conversationId: convId, text: 'hello' }),
		});
		httpStatus = res.status;
		if (!res.ok) {
			let body: { code?: string } | null = null;
			try {
				body = (await res.json()) as { code?: string };
			} catch {
				body = null;
			}
			errorCode = body?.code ?? `http_${res.status}`;
			tDone = performance.now();
		} else {
			const reader = res.body!.getReader();
			const dec = new TextDecoder();
			let buf = '';
			let finished = false;
			while (!finished) {
				const cut = buf.indexOf('\n\n');
				if (cut < 0) {
					const { value, done } = await reader.read();
					if (done) break;
					buf += dec.decode(value, { stream: true });
					continue;
				}
				const frame = buf.slice(0, cut);
				buf = buf.slice(cut + 2);
				let event = 'message';
				const dataLines: string[] = [];
				for (const line of frame.split('\n')) {
					if (line.startsWith('event: ')) event = line.slice(7);
					else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
				}
				if (dataLines.length > 0) {
					let data: unknown = null;
					try {
						data = JSON.parse(dataLines.join('\n'));
					} catch {
						data = null;
					}
					if (event === 'text.delta' && tFirst === null) tFirst = performance.now();
					if (event === 'error') {
						const code = (data as { code?: string } | null)?.code;
						errorCode = code ?? 'stream_error';
					}
					if (event === 'done') finished = true;
				}
			}
			tDone = performance.now();
			httpStatus = 200;
			if (errorCode === null && tFirst === null) errorCode = 'no_text_delta';
		}
	} catch {
		errorCode = 'fetch_error';
		tDone = performance.now();
	}

	const overheadMs = tFirst !== null ? tFirst - t0 - 300 : null;
	return {
		phase,
		step,
		t0,
		t_first: tFirst,
		t_done: tDone,
		httpStatus,
		status: httpStatus,
		errorCode,
		overheadMs,
		durationMs: tDone - t0,
	};
}

const allRecords: RunRecord[] = [];

// Profile phase.
{
	const phase = 'profile';
	const step = '3.5rps';
	const phaseStart = performance.now();
	const phaseEnd = phaseStart + PROFILE_SECONDS * 1000;
	const inFlight: Promise<void>[] = [];
	let nextArrival = phaseStart;
	while (nextArrival < phaseEnd) {
		const gapSec = -Math.log(1 - rng()) / RATE;
		nextArrival += gapSec * 1000;
		if (nextArrival >= phaseEnd) break;
		const wait = nextArrival - performance.now();
		if (wait > 0) await sleep(wait);
		if (performance.now() >= phaseEnd) break;
		const p = runOnce(phase, step)
			.then((r) => {
				allRecords.push(r);
				appendFileSync(RUNS_PATH, `${JSON.stringify(r)}\n`);
			})
			.catch(() => {});
		inFlight.push(p);
	}
	await Promise.all(inFlight);
}

// Steps phase.
for (const concurrency of [35, 70, 140, 280]) {
	const phase = 'steps';
	const step = String(concurrency);
	const phaseStart = performance.now();
	const phaseEnd = phaseStart + STEP_SECONDS * 1000;
	const inFlight = new Set<Promise<void>>();

	const launch = () => {
		const p = runOnce(phase, step)
			.then((r) => {
				allRecords.push(r);
				appendFileSync(RUNS_PATH, `${JSON.stringify(r)}\n`);
			})
			.finally(() => {
				inFlight.delete(p);
			})
			.catch(() => {});
		inFlight.add(p);
	};

	while (inFlight.size < concurrency && performance.now() < phaseEnd) launch();
	while (performance.now() < phaseEnd) {
		await sleep(50);
		while (inFlight.size < concurrency && performance.now() < phaseEnd) launch();
	}
	await Promise.all(inFlight);
}

// Write loadavg.
const loadEnd = os.loadavg();
let loadStart: number[] = [];
try {
	loadStart = JSON.parse(readFileSync(`${SHARED_DIR}/load-loadavg-start.json`, 'utf8')) as number[];
} catch {
	loadStart = os.loadavg();
}
writeFileSync(`${SHARED_DIR}/load-loadavg.json`, JSON.stringify({ start: loadStart, end: loadEnd }));

// Also ensure all records written (already appended).
writeFileSync(RUNS_PATH + '.done', JSON.stringify({ records: allRecords.length }));
console.log(JSON.stringify({ event: 'load_done', records: allRecords.length }));
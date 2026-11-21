/**
 * AB4 baseline, local half: `usage.timing.preflight_ms` of N sequential runs
 * against the throwaway Postgres + Redis and the mock upstream of the test
 * harness. No provider is called and no platform key is used.
 *
 * usage (from the repo root; the suite harness starts the stack):
 *   AI_TEST_FILES=scripts/bench/preflight-local.ts BENCH_RUNS=30 \
 *     sh services/osionos-ai/scripts/test.sh <the AI migrations>
 *
 * Caveat: the database is a local container, so the round-trips that dominate
 * a live pre-flight (the VM's tailnet TCP serve) are near zero here. This is
 * the floor of the pre-flight and the A/B harness for a phase on the same
 * stack; it says nothing about the live absolute number.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, it } from 'node:test';
import { startHarness } from '../../tests/harness.ts';
import { SseStream, collect } from '../../tests/sse.ts';

const RUNS = Number(process.env.BENCH_RUNS) > 0 ? Number(process.env.BENCH_RUNS) : 30;
const { app, mock, postRun, createConversation } = await startHarness();
after(async () => {
	await app.close();
	await mock.close();
});

/** Nearest-rank percentile of a sorted list. */
function percentile(sorted: number[], p: number): number {
	return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

it(`preflight_ms over ${RUNS} runs`, async () => {
	mock.setOptions({ preDelayMs: 0, chunkCount: 4, chunkGapMs: 0, fail: false });
	const marks: number[] = [];
	for (let run = 0; run < RUNS; run += 1) {
		const runId = randomUUID();
		await collect(new SseStream(await postRun(await createConversation(), runId, 'hello')));
		const row = await app.db.query('select usage from public.ai_runs where id = $1', [runId]);
		marks.push(row.rows[0].usage.timing.preflight_ms as number);
	}
	assert.equal(marks.length, RUNS);
	const sorted = [...marks].sort((a, b) => a - b);
	console.log(JSON.stringify({ metric: 'preflight_ms', n: RUNS, p50: percentile(sorted, 50), p95: percentile(sorted, 95), min: sorted[0], max: sorted[sorted.length - 1], samples: marks }));
});

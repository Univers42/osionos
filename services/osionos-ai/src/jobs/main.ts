/**
 * The jobs worker: the third entrypoint of the osionos-ai image. Today it
 * drains one kind of job, 'moderate' (the L1 moderation worker); the other
 * kinds get their own handler here when they exist.
 *
 * The environment:
 *   OSIONOS_AI_DATABASE_URL            the database of the service (the queue is there)
 *   OSIONOS_MODERATION_ACTIONS         off | log | hold | on (default log; on is held to hold)
 *   OSIONOS_MODERATION_L1_URL          the TEI that serves the toxicity classifier (required unless off)
 *   OSIONOS_MODERATION_L1_MODEL        the model id (default: the pinned one of the A1 spike)
 *   OSIONOS_MODERATION_L1_REVISION     its revision
 *   OSIONOS_MODERATION_L1_HOLD         the toxic score from which a comment is held (default 0.9)
 *   OSIONOS_MODERATION_CALIBRATED_POLICY  the policy hash the thresholds were calibrated for;
 *                                      another hash runs in log mode (C85)
 *
 * With `off` the process stays up and does nothing, so a restart policy does
 * not turn the kill switch into a crash loop.
 */

import { createPool } from '../db.ts';
import { createL1Handler } from '../moderation/l1.ts';
import { resolvePolicy } from '../moderation/policy.ts';
import type { ModerationPolicy } from '../moderation/policy.ts';
import { JobWorker } from './worker.ts';

const databaseUrl = process.env.OSIONOS_AI_DATABASE_URL ?? '';
if (databaseUrl.length === 0) {
	// The name only: a URL may hold a password.
	console.error('[osionos-ai-jobs] refusing to start: invalid environment variables: OSIONOS_AI_DATABASE_URL');
	process.exit(1);
}

let policy: ModerationPolicy;
try {
	policy = resolvePolicy(process.env);
} catch (error) {
	console.error(`[osionos-ai-jobs] refusing to start: ${(error as Error).message}`);
	process.exit(1);
}

let stop = async (): Promise<void> => undefined;

if (!policy.runsWorker) {
	console.log(JSON.stringify({ event: 'moderation_off' }));
} else {
	if (policy.removeRefused) {
		console.log(JSON.stringify({ event: 'moderation_remove_refused', detail: 'OSIONOS_MODERATION_ACTIONS=on runs as hold: no language has the C83 evidence for auto-removal' }));
	}
	if (policy.configured !== 'log' && policy.mode === 'log') {
		console.log(JSON.stringify({ event: 'moderation_uncalibrated', detail: 'the policy hash is not OSIONOS_MODERATION_CALIBRATED_POLICY: running in log mode', policyHash: policy.policyHash }));
	}
	const pool = createPool(databaseUrl);
	const worker = new JobWorker({ pool, databaseUrl, kind: 'moderate', handle: createL1Handler({ pool, policy }) });
	await worker.start();
	console.log(JSON.stringify({ event: 'moderation_started', mode: policy.mode, model: policy.model, policyHash: policy.policyHash }));
	stop = async () => {
		await worker.stop();
		await pool.end();
	};
}

/** The stop: the handlers in flight are aborted, the row keeps its lease, the process ends. */
async function shutdown(): Promise<void> {
	await stop();
	process.exit(0);
}

process.on('SIGTERM', () => {
	void shutdown();
});
process.on('SIGINT', () => {
	void shutdown();
});
// Off: nothing else keeps the event loop alive.
if (!policy.runsWorker) setInterval(() => undefined, 1 << 30);

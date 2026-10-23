/**
 * The jobs worker: the third entrypoint of the osionos-ai image. Today it
 * drains two kinds of job: 'moderate' (the L1 moderation worker) and
 * 'sentiment' (page comments of the workspaces that opted in); the other
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
 *   OSIONOS_SENTIMENT_URL              the TEI that serves the sentiment model; empty = no sentiment
 *                                      worker (C147), whatever the moderation mode is
 *   OSIONOS_SENTIMENT_MODEL            the model id (default cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual)
 *   OSIONOS_SENTIMENT_REVISION         its pinned revision
 *
 * With both off the process stays up and does nothing, so a restart policy does
 * not turn the kill switch into a crash loop.
 */

import type { Pool } from 'pg';
import { createPool } from '../db.ts';
import { createL1Handler } from '../moderation/l1.ts';
import { resolvePolicy } from '../moderation/policy.ts';
import type { ModerationPolicy } from '../moderation/policy.ts';
import { createSentimentHandler } from '../sentiment/handler.ts';
import { JobWorker } from './worker.ts';

const SENTIMENT_MODEL = 'cardiffnlp/twitter-xlm-roberta-base-sentiment-multilingual';
const SENTIMENT_REVISION = '82107f4ccba672c9ab1eee538e727e462cad21de';

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

const workers: JobWorker[] = [];
let pool: Pool | null = null;
const sharedPool = (): Pool => (pool ??= createPool(databaseUrl));

if (!policy.runsWorker) {
	console.log(JSON.stringify({ event: 'moderation_off' }));
} else {
	if (policy.removeRefused) {
		console.log(JSON.stringify({ event: 'moderation_remove_refused', detail: 'OSIONOS_MODERATION_ACTIONS=on runs as hold: no language has the C83 evidence for auto-removal' }));
	}
	if (policy.configured !== 'log' && policy.mode === 'log') {
		console.log(JSON.stringify({ event: 'moderation_uncalibrated', detail: 'the policy hash is not OSIONOS_MODERATION_CALIBRATED_POLICY: running in log mode', policyHash: policy.policyHash }));
	}
	const db = sharedPool();
	const worker = new JobWorker({ pool: db, databaseUrl, kind: 'moderate', handle: createL1Handler({ pool: db, policy }) });
	await worker.start();
	workers.push(worker);
	console.log(JSON.stringify({ event: 'moderation_started', mode: policy.mode, model: policy.model, policyHash: policy.policyHash }));
}

const sentimentUrl = process.env.OSIONOS_SENTIMENT_URL ?? '';
if (sentimentUrl.length === 0) {
	console.log(JSON.stringify({ event: 'sentiment_off' }));
} else {
	const db = sharedPool();
	const model = process.env.OSIONOS_SENTIMENT_MODEL || SENTIMENT_MODEL;
	const revision = process.env.OSIONOS_SENTIMENT_REVISION || SENTIMENT_REVISION;
	const worker = new JobWorker({
		pool: db,
		databaseUrl,
		kind: 'sentiment',
		handle: createSentimentHandler({ pool: db, teiUrl: sentimentUrl, model, revision }),
	});
	await worker.start();
	workers.push(worker);
	console.log(JSON.stringify({ event: 'sentiment_started', model }));
}

async function stop(): Promise<void> {
	await Promise.all(workers.map((worker) => worker.stop()));
	await pool?.end();
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
// Neither worker runs: nothing else keeps the event loop alive.
if (workers.length === 0) setInterval(() => undefined, 1 << 30);

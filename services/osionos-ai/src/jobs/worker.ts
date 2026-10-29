/**
 * The worker of the enrichment jobs: the queue in, the classification out.
 * One worker does ONE kind: a worker of 'moderate' runs the moderation jobs
 * and leaves the sentiment ones alone — the handlers differ, and the queue of
 * a kind is drained by the process that knows how to do it.
 *
 * The loop is the indexer's (src/indexer/worker.ts): a LISTEN on the channel
 * ai_jobs, a poll for the notification that was lost, a round that does not
 * pile up, and a stop that drains. The concurrency is the indexer's too: the
 * AIMD controller, fed with the latency.
 *
 * Caveat: the lease is a promise, not a lock. A handler slower than the lease
 * lets a second replica take the same job, and the two results race: a
 * handler writes its result keyed by the hash it classified.
 */

import { Client } from 'pg';
import type { Pool } from 'pg';
import { EmbedConcurrency, classify } from '../indexer/concurrency.ts';
import { claimJobs, completeJob, failJob } from './queue.ts';
import type { Job, JobKind } from './queue.ts';

/** The configuration of the worker. */
export interface JobWorkerOptions {
	/** The pool of the service. */
	pool: Pool;
	/** The URL of the database, for the listener (the one of the pool). */
	databaseUrl?: string;
	/** The kind of work this worker does. */
	kind: JobKind;
	/**
	 * The handler: it does the work of one job. It is given the ids of the
	 * subject and the signal of the worker, and it stops when the signal is
	 * aborted.
	 */
	handle(job: Job, signal: AbortSignal): Promise<void>;
	/** The most jobs of one claim. */
	batchSize?: number;
	/** The lease, in seconds: how long a claimed job stays out of the queue. */
	leaseSeconds?: number;
	/** The number of tries after which a job is left alone. */
	maxAttempts?: number;
	/** The poll of the queue, in milliseconds. */
	pollMs?: number;
	/** The latency a handler must answer under to count as fast. */
	targetMs?: number;
	/** The most handlers in flight at once. */
	maxConcurrency?: number;
	/** The log: one line per job, never the content of a subject. */
	log?: (entry: Record<string, unknown>) => void;
}

/** The defaults: the batch of a claim, the lease, the tries, the poll, the target, the concurrency. */
export const BATCH_SIZE = 8;
export const LEASE_SECONDS = 300;
export const MAX_ATTEMPTS = 8;
export const POLL_INTERVAL_MS = 5_000;
export const TARGET_MS = 800;
export const MAX_CONCURRENCY = 4;

/** The worker of one kind of job: one instance per process and per kind. */
export class JobWorker {
	private readonly pool: Pool;
	private readonly kind: JobKind;
	private readonly handle: (job: Job, signal: AbortSignal) => Promise<void>;
	private readonly batchSize: number;
	private readonly leaseSeconds: number;
	private readonly maxAttempts: number;
	private readonly pollMs: number;
	private readonly targetMs: number;
	private readonly concurrency: EmbedConcurrency;
	private readonly log: (entry: Record<string, unknown>) => void;
	private readonly databaseUrl: string;
	private readonly abort = new AbortController();
	private stopping = false;
	private running: Promise<void> | null = null;
	private again = false;
	private listener: Client | null = null;
	private timer: NodeJS.Timeout | null = null;

	constructor(options: JobWorkerOptions) {
		this.pool = options.pool;
		this.kind = options.kind;
		this.handle = options.handle;
		this.batchSize = Math.max(1, Math.floor(options.batchSize ?? BATCH_SIZE));
		this.leaseSeconds = Math.max(1, Math.floor(options.leaseSeconds ?? LEASE_SECONDS));
		this.maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? MAX_ATTEMPTS));
		this.pollMs = Math.max(1, Math.floor(options.pollMs ?? POLL_INTERVAL_MS));
		this.targetMs = Math.max(1, Math.floor(options.targetMs ?? TARGET_MS));
		// The controller of the indexer: the limit survives the rounds.
		this.concurrency = new EmbedConcurrency({ max: options.maxConcurrency ?? MAX_CONCURRENCY });
		this.log = options.log ?? ((entry) => console.log(JSON.stringify(entry)));
		this.databaseUrl = options.databaseUrl ?? options.pool.options.connectionString ?? '';
	}

	/**
	 * The listener and the poll. The listener is a client of its own: it holds
	 * nothing but the LISTEN, so a job that takes a long time never keeps the
	 * queue waiting. The poll is the safety net for a lost notification.
	 */
	async start(): Promise<void> {
		if (this.databaseUrl.length > 0) {
			const listener = new Client({ connectionString: this.databaseUrl, application_name: 'osionos-ai-jobs' });
			listener.on('notification', (notification) => {
				if (notification.payload !== this.kind) return;
				this.trigger();
			});
			listener.on('error', () => {
				this.log({ event: 'listener_error' });
			});
			await listener.connect();
			await listener.query('LISTEN ai_jobs');
			this.listener = listener;
		}
		this.timer = setInterval(() => this.trigger(), this.pollMs);
		this.timer.unref?.();
		// The queue may already hold work when the worker starts.
		this.trigger();
	}

	/**
	 * The stop: the handlers are told to stop, the round is finished, and the
	 * listener is closed. The signal is aborted FIRST.
	 */
	async stop(): Promise<void> {
		this.stopping = true;
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		this.abort.abort();
		if (this.running) await this.running;
		if (this.listener) {
			const listener = this.listener;
			this.listener = null;
			await listener.end().catch(() => undefined);
		}
	}

	// A round, now. The rounds do not pile up: one runs at a time.
	private trigger(): void {
		if (this.stopping) return;
		if (this.running) {
			this.again = true;
			return;
		}
		this.running = this.run().finally(() => {
			this.running = null;
			if (this.again && !this.stopping) {
				this.again = false;
				this.trigger();
			}
		});
	}

	// The rounds: the queue is emptied, then the worker waits. A round that
	// filled its batch may have left work behind: it runs again at once.
	private async run(): Promise<void> {
		while (!this.stopping) {
			let round = { claimed: 0, limit: 0 };
			try {
				round = await this.round();
			} catch {
				this.log({ event: 'round_failed', kind: this.kind });
				return;
			}
			if (round.claimed < round.limit) return;
		}
	}

	// One round: the jobs that are due are claimed, and their handlers run.
	// The batch is the smaller of the two bounds: the batch of the worker and
	// the limit of the controller, which grows with the handlers.
	private async round(): Promise<{ claimed: number; limit: number }> {
		const limit = Math.max(1, Math.min(this.batchSize, this.concurrency.current));
		const jobs = await claimJobs(this.pool, {
			kind: this.kind,
			maxAttempts: this.maxAttempts,
			limit,
			leaseSeconds: this.leaseSeconds,
		});
		if (jobs.length === 0) return { claimed: 0, limit };
		await this.runJobs(jobs);
		return { claimed: jobs.length, limit };
	}

	// The jobs of the round: their handlers run, at most the limit of the
	// controller in flight, read again for every job: it moves with them.
	private async runJobs(jobs: Job[]): Promise<void> {
		const running = new Set<Promise<void>>();
		for (const job of jobs) {
			while (running.size >= this.concurrency.current) {
				await Promise.race(running);
			}
			const call = this.runJob(job).finally(() => {
				running.delete(call);
			});
			running.add(call);
		}
		await Promise.all(running);
	}

	// One job: the handler runs, and the row is either deleted or failed. The
	// latency of the handler feeds the controller: a fast handler buys one
	// more job in flight, a slow one halves the number. A handler that throws
	// is a slow answer: a smaller concurrency is the safe answer.
	private async runJob(job: Job): Promise<void> {
		const started = Date.now();
		try {
			await this.handle(job, this.abort.signal);
		} catch (error) {
			this.concurrency.observe('slow');
			await this.recordFailure(job, error);
			return;
		}
		this.concurrency.observe(classify(Date.now() - started, this.targetMs));
		// A handler that returned because the worker is stopping may not have
		// finished: the row keeps its lease and runs again when the lease ends.
		if (this.abort.signal.aborted) {
			this.log({ event: 'job_interrupted', ...this.ids(job) });
			return;
		}
		try {
			await completeJob(this.pool, job);
		} catch {
			this.log({ event: 'job_not_deleted', ...this.ids(job) });
			return;
		}
		this.log({ event: 'job_done', ...this.ids(job) });
	}

	// The failure of a job: one more try, the reason in the row of the queue,
	// and one line in the log. The log carries the ids and the count of the
	// tries, and nothing else: the content of a subject never reaches a line.
	private async recordFailure(job: Job, error: unknown): Promise<void> {
		let attempts: number | null = null;
		try {
			attempts = await failJob(this.pool, job, error);
		} catch {
			this.log({ event: 'job_failure_not_recorded', ...this.ids(job) });
			return;
		}
		const count = attempts ?? 0;
		this.log({
			event: count >= this.maxAttempts ? 'job_gave_up' : 'job_failed',
			...this.ids(job),
			attempts: count,
		});
	}

	/** The ids of a job: what a log line may carry. */
	private ids(job: Job): Record<string, unknown> {
		return { kind: job.kind, subjectKind: job.subjectKind, subjectId: job.subjectId };
	}
}

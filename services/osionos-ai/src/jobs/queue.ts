/**
 * The queue of the enrichment jobs: the typed functions over the statements of
 * sql.ts.
 *
 * Every function takes a runner (the pool, or one of its clients), so a
 * caller that needs the claim and the delete in ONE transaction can hold a
 * client and pass it. The worker uses the pool.
 *
 * A job is ids: the kind, the subject and what the queue knows about it. The
 * content of the subject is never here — the handler reads what it needs
 * itself, and what it fails with is an error, not the text of a comment.
 */

import type { QueryRunner } from '../db.ts';
import { CLAIM_SQL, DONE_SQL, ENQUEUE_SQL, FAIL_SQL } from './sql.ts';
import type { JobRow } from './sql.ts';

/** The kinds of work the queue holds. */
export type JobKind = 'moderate' | 'sentiment' | 'image_tag';

/** A job: the subject to enrich, and what the queue knows about it. */
export interface Job {
	/** The kind of work: moderation, sentiment or image tagging. */
	kind: JobKind;
	/** The kind of the subject: a comment, a row, a media. */
	subjectKind: string;
	/** The id of the subject. */
	subjectId: string;
	/** The workspace of the subject, when it has one. */
	workspaceId: string | null;
	/** The lane: lower runs first. */
	priority: number;
	/** The number of tries the job had before this claim. */
	attempts: number;
	/**
	 * The moment the row was enqueued, as the text the claim returned.
	 *
	 * It is the token of the row: the delete and the failure only touch the
	 * row that was claimed, and a row that was re-enqueued in the meantime
	 * carries another one.
	 */
	enqueuedAt: string;
	/**
	 * The sha256 of the content the subject was queued for, or null. A handler
	 * writes its result keyed by it, so a result of older content is
	 * recognisable (the caveat of the migration).
	 */
	contentSha256: string | null;
}

/** The options of a claim. */
export interface ClaimOptions {
	/** The kind of work the worker does. */
	kind: JobKind;
	/** The number of tries after which a job is left alone. */
	maxAttempts: number;
	/** The most jobs of one claim. */
	limit: number;
	/** The lease, in seconds: how long a claimed job stays out of the queue. */
	leaseSeconds: number;
}

/** A job to queue. */
export interface EnqueueJobInput {
	/** The kind of work. */
	kind: JobKind;
	/** The kind of the subject: a comment, a row, a media. */
	subjectKind: string;
	/** The id of the subject. */
	subjectId: string;
	/** The workspace of the subject, when it has one. */
	workspaceId?: string | null;
	/** The lane: lower runs first; the table's default, 5, when absent. */
	priority?: number;
	/** The sha256 of the content being queued, when the producer has it. */
	contentSha256?: string | null;
}

/** The lane of a job queued without one: the table's default. */
const DEFAULT_PRIORITY = 5;

/** The longest error the queue keeps. */
const MAX_ERROR_CHARS = 500;

/** A row of the queue, as a job. */
function toJob(row: JobRow): Job {
	return {
		kind: row.kind as JobKind,
		subjectKind: row.subject_kind,
		subjectId: row.subject_id,
		workspaceId: row.workspace_id,
		priority: Number(row.priority),
		attempts: Number(row.attempts),
		enqueuedAt: row.enqueued_at,
		contentSha256: row.content_sha256,
	};
}

/**
 * The claim: the jobs that are due, leased to this worker.
 *
 * The lease is the run_after pushed out by the lease seconds: a claimed job is
 * not runnable again until the lease ends, so a worker that dies does not
 * block its jobs for ever.
 */
export async function claimJobs(db: QueryRunner, options: ClaimOptions): Promise<Job[]> {
	const result = await db.query<JobRow>(CLAIM_SQL, [
		options.kind,
		options.maxAttempts,
		options.limit,
		options.leaseSeconds,
	]);
	return result.rows.map(toJob);
}

/**
 * The job is done: the row goes away — unless it was re-enqueued while the
 * job ran, in which case the row stays and the new content is done again.
 *
 * It says whether the row is gone.
 */
export async function completeJob(db: QueryRunner, job: Job): Promise<boolean> {
	const result = await db.query(DONE_SQL, [
		job.kind,
		job.subjectKind,
		job.subjectId,
		job.enqueuedAt,
	]);
	return (result.rowCount ?? 0) > 0;
}

/**
 * The error as the queue keeps it: its class and its message, and nothing
 * else.
 *
 * The message is cut at 500 characters (the column says so). It is NEVER the
 * content of the subject: a handler must not put the text of a comment in the
 * error it throws — the row of the queue is read by a human, and the comment
 * is not theirs.
 */
export function describeError(error: unknown): string {
	if (error instanceof Error) {
		const code = (error as Error & { code?: unknown }).code;
		const label = code === undefined || code === null || code === '' ? error.name : String(code);
		return `${label}: ${error.message}`.slice(0, MAX_ERROR_CHARS);
	}
	return String(error).slice(0, MAX_ERROR_CHARS);
}

/**
 * The failure: one more attempt, the reason, and the next try.
 *
 * It returns the number of tries the row carries now, or null when the row was
 * not failed — it was re-enqueued while the job ran, so it is a new job, at
 * attempt zero.
 */
export async function failJob(db: QueryRunner, job: Job, error: unknown): Promise<number | null> {
	const result = await db.query<{ attempts: number }>(FAIL_SQL, [
		job.kind,
		job.subjectKind,
		job.subjectId,
		job.enqueuedAt,
		describeError(error),
	]);
	const row = result.rows[0];
	return row ? Number(row.attempts) : null;
}

/**
 * The enqueue: the job goes into the queue.
 *
 * A subject that is already queued is not queued twice: the row is refreshed
 * (it runs now, from attempt zero, in the more urgent of the two lanes) and
 * the workers of the kind are woken by the notification.
 */
export async function enqueueJob(db: QueryRunner, input: EnqueueJobInput): Promise<void> {
	await db.query(ENQUEUE_SQL, [
		input.kind,
		input.subjectKind,
		input.subjectId,
		input.workspaceId ?? null,
		input.priority ?? DEFAULT_PRIORITY,
		input.contentSha256 ?? null,
	]);
}

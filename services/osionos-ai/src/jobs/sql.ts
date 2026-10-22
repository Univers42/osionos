/**
 * The SQL of the enrichment queue: the statements the worker runs, and the row
 * they read.
 *
 * The statements live here, apart from the queue and the worker, so the shape
 * of the lease and of the coalescing is written down in one place.
 *
 * The table is the migration's (models/osionos-ai-jobs-migration.sql): one row
 * per (kind, subject), the lane in priority, the moment of the enqueue in
 * enqueued_at, the tries of the worker in attempts.
 */

import type { QueryResultRow } from 'pg';

/** A row of the queue: the job to do, and the bookkeeping of the queue. */
export interface JobRow extends QueryResultRow {
	kind: string;
	subject_kind: string;
	subject_id: string;
	workspace_id: string | null;
	/** The lane of the job: lower runs first (the table's default is 5). */
	priority: number;
	/** The number of times the job was tried. */
	attempts: number;
	/**
	 * The moment the row was enqueued, as text.
	 *
	 * It is NOT a date: the driver reads a date with the milliseconds only,
	 * and the microseconds of the row would never match. The text is exact,
	 * and the delete compares what the claim returned.
	 */
	enqueued_at: string;
	/** The sha256 of the content the subject was queued for, when the producer gave it. */
	content_sha256: string | null;
}

/**
 * The claim: the jobs that are due, the lane of a person first, then the
 * oldest.
 *
 * ONE statement, on purpose. The lease (the run_after pushed out by the lease
 * seconds) is taken in the same statement that locks the rows, so:
 *   - two replicas never claim the same job: the second one skips the locked
 *     rows (FOR UPDATE SKIP LOCKED) and takes the next ones;
 *   - a worker that dies mid-job does not hold the job for ever: the lease
 *     ends and the row becomes due again.
 *
 * The kind is in the WHERE: a worker of one kind never touches the jobs of
 * another — a worker of 'moderate' does not run the sentiment jobs.
 *
 * The lane comes first: a lower priority runs first, so a comment queued at 0
 * never waits behind a backfill queued at the default 5.
 */
export const CLAIM_SQL = `
update public.ai_jobs j
   set run_after = now() + make_interval(secs => $4)
  from (select kind, subject_kind, subject_id
          from public.ai_jobs
         where kind = $1
           and run_after <= now()
           and attempts < $2
         order by priority, run_after
         limit $3
         for update skip locked) c
 where (j.kind, j.subject_kind, j.subject_id) = (c.kind, c.subject_kind, c.subject_id)
returning j.kind, j.subject_kind, j.subject_id, j.workspace_id, j.priority, j.attempts,
          j.enqueued_at::text as enqueued_at, j.content_sha256`;

/**
 * The job is done: the row goes away.
 *
 * The enqueued_at condition is the whole point: when the subject was edited
 * while the job ran, the row carries another enqueued_at, the delete touches
 * nothing, and the new content is done again.
 *
 * The moment is compared as the text the claim returned: a date would come
 * back from the driver with the milliseconds only, and the microseconds of
 * the row would never match.
 */
export const DONE_SQL = `
delete from public.ai_jobs
 where kind = $1
   and subject_kind = $2
   and subject_id = $3
   and enqueued_at = $4::timestamptz`;

/**
 * The failure: one more attempt, the reason, and the next try.
 *
 * The delay doubles with the attempts — 2, 4, 8… seconds — up to ten minutes,
 * so a job whose encoder is down does not spin.
 *
 * The reason is the class and the message of the error, cut at 500 characters
 * (the column says so). It is NEVER the content of the subject: a comment is
 * not a log line, and the row of the queue is read by a human.
 *
 * The enqueued_at condition is the one of the delete: a row that was
 * re-enqueued while the job ran is not failed — it is a new job, at attempt
 * zero, and its own error is gone.
 */
export const FAIL_SQL = `
update public.ai_jobs
   set attempts = attempts + 1,
       last_error = left($5, 500),
       run_after = now() + make_interval(secs => least(2 ^ (attempts + 1), 600))
 where kind = $1
   and subject_kind = $2
   and subject_id = $3
   and enqueued_at = $4::timestamptz
returning attempts`;

/**
 * The enqueue: the job goes into the queue.
 *
 * It is the migration's function and not a hand-written insert: it coalesces
 * the row (one row per kind and subject), keeps the more urgent of the two
 * lanes, resets the attempts, runs the job now, records the content hash, and
 * notifies the channel ai_jobs with the kind — the workers of that kind wake
 * on it.
 */
export const ENQUEUE_SQL = `select public.ai_enqueue_job($1, $2, $3, $4, $5::smallint, $6)`;

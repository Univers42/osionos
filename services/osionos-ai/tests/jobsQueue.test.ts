import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Pool } from 'pg';
import { claimJobs, completeJob, enqueueJob, failJob } from '../src/jobs/queue.ts';
import type { Job, JobKind } from '../src/jobs/queue.ts';

/**
 * The queue of the enrichment jobs, against the real database of the harness.
 *
 * The claims, the lanes, the coalescing of a subject that was edited while its
 * job ran, the backoff of a failure and the lease that ends: the rules the
 * migration writes down, proven one by one.
 */

const DATABASE_URL = process.env.OSIONOS_AI_DATABASE_URL ?? '';
const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });

/**
 * Whether the jobs migration is applied. The queue works on ai_jobs, so its
 * tests need that migration; a run without it skips them.
 */
const table = await pool.query("select to_regclass('public.ai_jobs') as jobs");
const hasJobs = Boolean(table.rows[0]?.jobs);

before(async () => {
	if (!hasJobs) return;
	// The rows of the other test files are not ours: the queue is emptied
	// before the first test, so a job of another file is never claimed here.
	await pool.query('delete from public.ai_jobs');
});

// Every test starts with an empty queue: the rows of the test before it are
// still due, and a claim would take them.
beforeEach(async () => {
	if (!hasJobs) return;
	await pool.query('delete from public.ai_jobs');
});

after(async () => {
	if (hasJobs) await pool.query('delete from public.ai_jobs');
	await pool.end();
});

/** A job in the queue. */
async function enqueue(
	subjectId: string,
	options: { kind?: JobKind; priority?: number } = {},
): Promise<void> {
	await enqueueJob(pool, {
		kind: options.kind ?? 'moderate',
		subjectKind: 'comment',
		subjectId,
		workspaceId: WORKSPACE,
		priority: options.priority ?? 1,
	});
}

/** The options of a claim of the tests. */
const claim = { kind: 'moderate' as JobKind, maxAttempts: 8, limit: 10, leaseSeconds: 300 };

/** The moment of a timestamp, in milliseconds since the epoch. */
function epoch(value: unknown): number {
	if (value instanceof Date) return value.getTime();
	return new Date(String(value)).getTime();
}

describe('the queue of the jobs', { timeout: 60_000, skip: hasJobs ? false : 'the jobs migration was not applied' }, () => {
	it('claims two batches that do not overlap, and leases what it claims', async () => {
		for (let index = 0; index < 5; index += 1) await enqueue(`disjoint-${index}`);

		// The first claim holds its transaction open: the rows it took stay
		// locked, so the second claim must take the other ones.
		const client = await pool.connect();
		let first: Job[] = [];
		let second: Job[] = [];
		try {
			await client.query('BEGIN');
			[first, second] = await Promise.all([
				claimJobs(client, { ...claim, limit: 3 }),
				claimJobs(pool, { ...claim, limit: 3 }),
			]);
			await client.query('COMMIT');
		} finally {
			await client.query('ROLLBACK').catch(() => undefined);
			client.release();
		}

		const claimed = [...first, ...second];
		assert.equal(claimed.length, 5);
		assert.equal(new Set(claimed.map((job) => job.subjectId)).size, 5);

		// Every claimed row is leased: it is not runnable again before the
		// lease ends.
		const rows = await pool.query(
			'select subject_id, run_after > now() as leased from public.ai_jobs order by subject_id',
		);
		assert.equal(rows.rows.length, 5);
		for (const row of rows.rows) assert.equal(row.leased, true);
	});

	it('claims the lane of a person before the bulk work', async () => {
		await enqueue('bulk-one', { priority: 1 });
		await enqueue('urgent-one', { priority: 0 });

		const claimed = await claimJobs(pool, { ...claim, limit: 1 });
		assert.equal(claimed.length, 1);
		assert.equal(claimed[0]?.subjectId, 'urgent-one');
	});

	it('never claims a job of another kind', async () => {
		await enqueue('a-moderate', { kind: 'moderate' });
		await enqueue('a-sentiment', { kind: 'sentiment' });

		const claimed = await claimJobs(pool, { ...claim, kind: 'sentiment', limit: 10 });
		assert.equal(claimed.length, 1);
		assert.equal(claimed[0]?.kind, 'sentiment');
		assert.equal(claimed[0]?.subjectId, 'a-sentiment');
	});

	it('does not delete a row that was re-enqueued while the job ran', async () => {
		await enqueue('edited');
		const [claimed] = await claimJobs(pool, { ...claim, limit: 1 });
		assert.ok(claimed);

		// The subject was edited while the job ran: the row carries another
		// enqueued_at, and it is a new job at attempt zero.
		await enqueue('edited');
		assert.equal(await completeJob(pool, claimed!), false);

		const row = await pool.query(
			'select attempts, run_after <= now() as runnable from public.ai_jobs where subject_id = $1',
			['edited'],
		);
		assert.equal(row.rows.length, 1);
		assert.equal(Number(row.rows[0]?.attempts), 0);
		assert.equal(row.rows[0]?.runnable, true);
	});

	it('hands the handler the content hash the job was queued for', async () => {
		const sha = 'a'.repeat(64);
		await enqueueJob(pool, { kind: 'moderate', subjectKind: 'comment', subjectId: 'hashed', contentSha256: sha });
		await enqueue('unhashed');
		const claimed = await claimJobs(pool, { ...claim, limit: 10 });
		const bySubject = new Map(claimed.map((job) => [job.subjectId, job]));
		assert.equal(bySubject.get('hashed')?.contentSha256, sha);
		assert.equal(bySubject.get('unhashed')?.contentSha256, null);
		// Queued without a lane, the job takes the table's default.
		assert.equal(bySubject.get('hashed')?.priority, 5);
	});

	it('counts the tries, backs off, and cuts the error', async () => {
		await enqueue('failing');
		const [claimed] = await claimJobs(pool, { ...claim, limit: 1 });
		assert.ok(claimed);

		const error = new Error('x'.repeat(2000));
		assert.equal(await failJob(pool, claimed!, error), 1);
		assert.equal(await failJob(pool, claimed!, error), 2);

		const row = await pool.query(
			'select attempts, last_error, run_after from public.ai_jobs where subject_id = $1',
			['failing'],
		);
		assert.equal(Number(row.rows[0]?.attempts), 2);
		const message = String(row.rows[0]?.last_error ?? '');
		assert.ok(message.length <= 500, `the error is cut: ${message.length}`);
		assert.ok(message.startsWith('Error: '));
		// The backoff doubles with the tries: 2 s, then 4 s.
		const delay = (epoch(row.rows[0]?.run_after) - Date.now()) / 1000;
		assert.ok(Math.abs(delay - 4) <= 1, `the next try is in 4 s: ${delay}`);
	});

	it('never claims a job that ran out of tries', async () => {
		await enqueue('exhausted');
		await pool.query('update public.ai_jobs set attempts = 8 where subject_id = $1', ['exhausted']);

		const claimed = await claimJobs(pool, { ...claim, limit: 10 });
		assert.equal(claimed.length, 0);
	});

	it('claims a job again when its lease ended', async () => {
		await enqueue('leased');
		const [first] = await claimJobs(pool, { ...claim, limit: 1 });
		assert.ok(first);

		// The worker that took it died: the lease ended, and the job is due.
		await pool.query(
			"update public.ai_jobs set run_after = now() - interval '1 s' where subject_id = $1",
			['leased'],
		);

		const [second] = await claimJobs(pool, { ...claim, limit: 1 });
		assert.ok(second);
		assert.equal(second?.subjectId, 'leased');
	});
});

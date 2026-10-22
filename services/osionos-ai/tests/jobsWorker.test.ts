import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Pool } from 'pg';
import { enqueueJob } from '../src/jobs/queue.ts';
import { JobWorker } from '../src/jobs/worker.ts';

/**
 * The worker of the enrichment jobs, against the real database of the harness.
 *
 * The worker wakes on the notification of the queue, runs the handler of a
 * job, and either deletes the row or fails it. The stop drains the handlers
 * that wait for their signal.
 */

const DATABASE_URL = process.env.OSIONOS_AI_DATABASE_URL ?? '';
const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });

/**
 * Whether the jobs migration is applied. The worker works on ai_jobs, so its
 * tests need that migration; a run without it skips them.
 */
const table = await pool.query("select to_regclass('public.ai_jobs') as jobs");
const hasJobs = Boolean(table.rows[0]?.jobs);

before(async () => {
	if (!hasJobs) return;
	await pool.query('delete from public.ai_jobs');
});

// Every test starts with an empty queue: a job of the test before it is still
// due, and the worker would claim it too.
beforeEach(async () => {
	if (!hasJobs) return;
	await pool.query('delete from public.ai_jobs');
});

after(async () => {
	if (hasJobs) await pool.query('delete from public.ai_jobs');
	await pool.end();
});

/** The number of rows of the queue for a subject. */
async function rowsOf(subjectId: string): Promise<number> {
	const result = await pool.query(
		'select count(*)::int as count from public.ai_jobs where subject_id = $1',
		[subjectId],
	);
	return Number(result.rows[0]?.count ?? 0);
}

/** Until the condition is true, or the deadline is reached. */
async function waitFor(
	condition: () => boolean | Promise<boolean>,
	timeoutMs = 5_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await condition()) return;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error('the condition was not met in time');
}

describe('the worker of the jobs', { timeout: 60_000, skip: hasJobs ? false : 'the jobs migration was not applied' }, () => {
	it('wakes up on the notification of the queue', async () => {
		let handled = 0;
		const worker = new JobWorker({
			pool,
			kind: 'moderate',
			// The poll is far away: only the notification can wake the worker.
			pollMs: 60_000,
			handle: async () => {
				handled += 1;
			},
		});
		await worker.start();
		try {
			await enqueueJob(pool, {
				kind: 'moderate',
				subjectKind: 'comment',
				subjectId: 'notified',
				workspaceId: WORKSPACE,
				priority: 0,
			});
			await waitFor(async () => (await rowsOf('notified')) === 0);
		} finally {
			await worker.stop();
		}
		assert.equal(handled, 1);
	});

	it('records the failure of a job that throws, without the content of the subject', async () => {
		const logs: Record<string, unknown>[] = [];
		const worker = new JobWorker({
			pool,
			kind: 'sentiment',
			pollMs: 60_000,
			handle: async () => {
				throw new Error('the text of the comment is private');
			},
			log: (entry) => {
				logs.push(entry);
			},
		});
		await worker.start();
		try {
			await enqueueJob(pool, {
				kind: 'sentiment',
				subjectKind: 'comment',
				subjectId: 'broken',
				workspaceId: WORKSPACE,
				priority: 0,
			});
			await waitFor(() => logs.some((entry) => entry.event === 'job_failed'));
		} finally {
			await worker.stop();
		}

		const row = await pool.query(
			'select attempts, last_error from public.ai_jobs where subject_id = $1',
			['broken'],
		);
		assert.equal(Number(row.rows[0]?.attempts), 1);
		assert.ok(String(row.rows[0]?.last_error).startsWith('Error: '));

		// The log carries the ids and the count of the tries, and nothing else.
		const line = logs.find((entry) => entry.event === 'job_failed');
		assert.ok(line, 'the failure is logged');
		assert.deepEqual(Object.keys(line ?? {}).sort(), [
			'attempts',
			'event',
			'kind',
			'subjectId',
			'subjectKind',
		]);
		assert.equal(line?.attempts, 1);
		assert.equal(line?.kind, 'sentiment');
		assert.equal(line?.subjectId, 'broken');
		assert.ok(!JSON.stringify(logs).includes('the text of the comment is private'));
	});

	it('stops while a handler waits for its signal', async () => {
		let started = false;
		const worker = new JobWorker({
			pool,
			kind: 'image_tag',
			pollMs: 60_000,
			handle: async (_job, signal) => {
				started = true;
				await new Promise<void>((resolve) => {
					if (signal.aborted) {
						resolve();
						return;
					}
					signal.addEventListener('abort', () => resolve());
				});
			},
		});
		await worker.start();
		await enqueueJob(pool, {
			kind: 'image_tag',
			subjectKind: 'media',
			subjectId: 'blocked',
			workspaceId: WORKSPACE,
			priority: 0,
		});
		await waitFor(() => started);

		const began = Date.now();
		await worker.stop();
		assert.ok(Date.now() - began < 5_000, 'the stop does not wait for the handler');
		assert.ok(started, 'the handler ran');
		// The handler was cut short: the job is not done, so its row stays,
		// leased, and runs again when the lease ends.
		assert.equal(await rowsOf('blocked'), 1);
	});
});

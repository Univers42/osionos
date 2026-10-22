import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { Client, Pool } from 'pg';
import { MAINTENANCE_LOCK_KEY, MaintenanceRunner } from '../src/maintenance/runner.ts';
import type { MaintenanceReport, MaintenanceSteps } from '../src/maintenance/runner.ts';

/**
 * The maintenance runner, against the database of the harness.
 *
 * The three functions of the migrations are NOT in this database (the suite
 * applies the three AI migrations, not the user-events one and not the
 * moderation one), so the test installs its own stubs: the same signatures, a
 * fixed answer, and a row in a scratch table that says which stub was called.
 *
 * Every test gets its own pools, and they are closed when the test ends: an
 * advisory lock belongs to a session, and a session that keeps it would hold
 * it for the next test too.
 */

const DATABASE_URL = process.env.OSIONOS_AI_DATABASE_URL ?? '';

/** The pools that are still open, closed at the end of the file. */
const pools: Pool[] = [];

/** A pool of its own. */
function newPool(): Pool {
	const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
	pools.push(pool);
	return pool;
}

/** A pool, closed: a pool that is ended twice is an error. */
async function closePool(pool: Pool): Promise<void> {
	const at = pools.indexOf(pool);
	if (at >= 0) pools.splice(at, 1);
	await pool.end();
}

/**
 * The pools of a test, closed when the test ends.
 *
 * A closed pool closes its sessions, and a session that ends releases the
 * advisory locks it holds: that is what keeps one test from locking the next.
 */
async function withPools<T>(count: number, body: (pools: Pool[]) => Promise<T>): Promise<T> {
	const own = Array.from({ length: count }, () => newPool());
	try {
		return await body(own);
	} finally {
		for (const pool of own) await closePool(pool);
	}
}

/** The pool that installs the stubs. */
const admin = new Pool({ connectionString: DATABASE_URL, max: 2 });
pools.push(admin);

/** The scratch table: one row per stub call. */
await admin.query(
	`create table if not exists public.maint_calls (
		id bigserial primary key,
		step text not null,
		at timestamptz not null default now()
	)`,
);

after(async () => {
	await admin.query('drop function if exists public.ai_events_maintain(interval)');
	await admin.query('drop function if exists public.ai_events_default_rows()');
	await admin.query('drop function if exists public.ai_moderation_events_prune(interval)');
	await admin.query('drop table if exists public.maint_calls');
	for (const pool of pools) await pool.end();
});

/** The steps of a report that did the work. */
function stepsOf(report: MaintenanceReport): MaintenanceSteps {
	if (!('steps' in report)) throw new Error('the run did the steps');
	return report.steps;
}

/** The number of calls of each stub. */
async function calls(): Promise<Record<string, number>> {
	const result = await admin.query<{ step: string; count: number }>(
		'select step, count(*)::int as count from public.maint_calls group by step order by step',
	);
	return Object.fromEntries(result.rows.map((row) => [row.step, row.count]));
}

/** The stubs of the three functions, and the way they answer. */
async function installStubs(options: { sleepMs?: number; defaultRows?: number | 'raise' } = {}): Promise<void> {
	await admin.query('truncate table public.maint_calls');
	await admin.query('drop function if exists public.ai_events_maintain(interval)');
	await admin.query('drop function if exists public.ai_events_default_rows()');
	await admin.query('drop function if exists public.ai_moderation_events_prune(interval)');
	await admin.query(
		`create function public.ai_events_maintain(p_retention interval default '180 days')
		 returns jsonb language plpgsql as $body$
		 begin
		   insert into public.maint_calls (step) values ('ai_events_maintain');
		   perform pg_sleep(${(options.sleepMs ?? 0) / 1000});
		   return jsonb_build_object('created', jsonb_build_array('ai_events_y209901'), 'dropped', jsonb_build_array('ai_events_y209801'));
		 end
		 $body$`,
	);
	const rows = options.defaultRows ?? 0;
	await admin.query(
		`create function public.ai_events_default_rows()
		 returns bigint language plpgsql as $body$
		 begin
		   insert into public.maint_calls (step) values ('ai_events_default_rows');
		   ${rows === 'raise' ? "raise exception 'the stub of the default rows fails';" : `return ${rows};`}
		 end
		 $body$`,
	);
	await admin.query(
		`create function public.ai_moderation_events_prune(p_keep interval default '365 days')
		 returns bigint language plpgsql as $body$
		 begin
		   insert into public.maint_calls (step) values ('ai_moderation_events_prune');
		   return 2;
		 end
		 $body$`,
	);
}

/** The three functions are not in the database. */
async function dropStubs(): Promise<void> {
	await admin.query('drop function if exists public.ai_events_maintain(interval)');
	await admin.query('drop function if exists public.ai_events_default_rows()');
	await admin.query('drop function if exists public.ai_moderation_events_prune(interval)');
	await admin.query('truncate table public.maint_calls');
}

describe('the maintenance runner', () => {
	it('runs the three steps and reports their answers', async () => {
		await installStubs();
		const logs: Record<string, unknown>[] = [];
		const report = await withPools(1, async ([pool]) => {
			const runner = new MaintenanceRunner({
				pool,
				intervalMs: 0,
				log: (entry) => logs.push(entry),
			});
			return await runner.runOnce();
		});
		assert.deepEqual(report, {
			steps: {
				ai_events_maintain: { created: ['ai_events_y209901'], dropped: ['ai_events_y209801'] },
				ai_events_default_rows: { rows: 0 },
				ai_moderation_events_prune: { deleted: 2 },
			},
		});
		// each stub was called exactly once
		assert.deepEqual(await calls(), {
			ai_events_default_rows: 1,
			ai_events_maintain: 1,
			ai_moderation_events_prune: 1,
		});
		// the report is ONE line of log
		assert.equal(logs.length, 1);
		assert.equal(logs[0]?.event, 'maintenance');
		assert.deepEqual(logs[0]?.steps, stepsOf(report));
	});

	it('skips a step whose function is absent, and fails nothing', async () => {
		await dropStubs();
		const report = await withPools(1, async ([pool]) =>
			await new MaintenanceRunner({ pool, intervalMs: 0 }).runOnce(),
		);
		assert.deepEqual(report, {
			steps: {
				ai_events_maintain: { skipped: 'absent' },
				ai_events_default_rows: { skipped: 'absent' },
				ai_moderation_events_prune: { skipped: 'absent' },
			},
		});
		assert.deepEqual(await calls(), {});
	});

	it('records the failure of a step and runs the next one', async () => {
		await installStubs({ defaultRows: 'raise' });
		const steps = await withPools(1, async ([pool]) =>
			stepsOf(await new MaintenanceRunner({ pool, intervalMs: 0 }).runOnce()),
		);
		assert.match(steps.ai_events_default_rows?.error ?? '', /^P0001 the stub of the default rows fails$/);
		assert.equal(steps.ai_events_maintain?.error, undefined);
		assert.deepEqual(steps.ai_events_maintain?.created, ['ai_events_y209901']);
		// the step after the failed one ran, and the row of the failed step was
		// rolled back with its transaction
		assert.equal(steps.ai_moderation_events_prune?.deleted, 2);
		assert.deepEqual(await calls(), { ai_events_maintain: 1, ai_moderation_events_prune: 1 });
	});

	it('lets one of two runners work, and the other skip', async () => {
		await installStubs({ sleepMs: 300 });
		const reports = await withPools(2, async ([first, second]) => {
			const one = new MaintenanceRunner({ pool: first, intervalMs: 0 });
			const two = new MaintenanceRunner({ pool: second, intervalMs: 0 });
			return await Promise.all([one.runOnce(), two.runOnce()]);
		});
		const skipped = reports.filter((report) => 'skipped' in report);
		const worked = reports.filter((report) => 'steps' in report);
		assert.equal(skipped.length, 1);
		assert.equal(worked.length, 1);
		assert.equal((skipped[0] as { skipped: string }).skipped, 'locked');
		// the steps ran once, not twice
		assert.deepEqual(await calls(), {
			ai_events_default_rows: 1,
			ai_events_maintain: 1,
			ai_moderation_events_prune: 1,
		});
	});

	it('skips the run when another client holds the lock', async () => {
		await installStubs();
		const holder = new Client({ connectionString: DATABASE_URL });
		await holder.connect();
		try {
			await holder.query('select pg_advisory_lock($1::bigint)', [MAINTENANCE_LOCK_KEY.toString()]);
			const report = await withPools(1, async ([pool]) =>
				await new MaintenanceRunner({ pool, intervalMs: 0 }).runOnce(),
			);
			assert.deepEqual(report, { skipped: 'locked' });
			await holder.query('select pg_advisory_unlock($1::bigint)', [MAINTENANCE_LOCK_KEY.toString()]);
		} finally {
			await holder.end().catch(() => undefined);
		}
		assert.deepEqual(await calls(), {});
	});

	it('warns when the DEFAULT partition holds rows', async () => {
		await installStubs({ defaultRows: 3 });
		const report = await withPools(1, async ([pool]) =>
			await new MaintenanceRunner({ pool, intervalMs: 0 }).runOnce(),
		);
		assert.equal(stepsOf(report).ai_events_default_rows?.rows, 3);
		assert.equal((report as { warn?: string }).warn, 'rows in the DEFAULT partition');
	});

	it('leaves the lock free after a run', async () => {
		await installStubs();
		// The pool of the runner stays open until the check is done: a session
		// that ends releases the locks it holds, and that would hide the leak.
		const pool = newPool();
		const third = new Client({ connectionString: DATABASE_URL });
		await third.connect();
		try {
			await new MaintenanceRunner({ pool, intervalMs: 0 }).runOnce();
			const answer = await third.query<{ locked: boolean }>(
				'select pg_try_advisory_lock($1::bigint) as locked',
				[MAINTENANCE_LOCK_KEY.toString()],
			);
			assert.equal(answer.rows[0]?.locked, true, 'the lock is free after the run');
			await third.query('select pg_advisory_unlock($1::bigint)', [MAINTENANCE_LOCK_KEY.toString()]);
		} finally {
			await third.end().catch(() => undefined);
			await closePool(pool);
		}
	});
});

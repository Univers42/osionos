/**
 * The daily maintenance runner: the partitions of ai_events, the health of the
 * DEFAULT partition, and the pruning of the moderation audit. The three
 * functions live in the migrations of the database; their headers said "the
 * daily runner is a later service slice". The indexer runs it, the HTTP
 * service does not.
 *
 * Caveat: this is an INTERVAL, not a calendar. A replica restarted every 30
 * seconds never reaches the first run, and the partition of month M+3 exists
 * only if a run happened in the last two months.
 */

import type { Pool, PoolClient } from 'pg';

/** The advisory lock of the maintenance: one runner at a time, in every replica. */
export const MAINTENANCE_LOCK_KEY = 5_203_991_847_713_920_517n;
/** The delay of the first run, in milliseconds: a minute, not the boot. */
export const MAINTENANCE_FIRST_MS = 60_000;
/** The interval between two runs, in milliseconds: six hours. */
export const MAINTENANCE_INTERVAL_MS = 21_600_000;
export const DEFAULT_PARTITION_WARNING = 'rows in the DEFAULT partition';

const LOCK_SQL = 'select pg_try_advisory_lock($1::bigint) as locked';
const UNLOCK_SQL = 'select pg_advisory_unlock($1::bigint)';
const PRESENT_SQL = 'select to_regprocedure($1) is not null as present';
/** One step of the maintenance: absent, failed, or the answer of the function. */
export type MaintenanceStep = {
	/** The function is not in this database: the step did not run. */
	skipped?: 'absent';
	/** The step failed: the SQLSTATE and the first line of the message. */
	error?: string;
	created?: string[];
	dropped?: string[];
	rows?: number;
	deleted?: number;
};

export type StepName = 'ai_events_maintain' | 'ai_events_default_rows' | 'ai_moderation_events_prune';
export type MaintenanceSteps = Partial<Record<StepName, MaintenanceStep>>;
/** The report of a run: another replica holds the lock, or the steps ran. */
export type MaintenanceReport = { skipped: 'locked' } | { steps: MaintenanceSteps; warn?: string };

/** The three steps, in the order they run: the function, and the call. */
const STEPS: Array<{ name: StepName; signature: string; call: string }> = [
	{ name: 'ai_events_maintain', signature: 'public.ai_events_maintain(interval)', call: 'select public.ai_events_maintain() as value' },
	{ name: 'ai_events_default_rows', signature: 'public.ai_events_default_rows()', call: 'select public.ai_events_default_rows() as value' },
	{ name: 'ai_moderation_events_prune', signature: 'public.ai_moderation_events_prune(interval)', call: 'select public.ai_moderation_events_prune() as value' },
];

function readStep(name: StepName, row: Record<string, unknown> | undefined): MaintenanceStep {
	const value = row?.value;
	if (typeof value !== 'object' || value === null) {
		const count = Number(value ?? 0);
		return name === 'ai_events_default_rows' ? { rows: count } : { deleted: count };
	}
	const partitions = value as { created?: string[]; dropped?: string[] };
	return { created: partitions.created ?? [], dropped: partitions.dropped ?? [] };
}

export interface MaintenanceRunnerOptions {
	pool: Pool;
	/** The interval between two runs, in milliseconds; 0 disables the runner. */
	intervalMs: number;
	firstDelayMs?: number;
	log?: (entry: Record<string, unknown>) => void;
}

/** The runner: the maintenance of the database, once every few hours. */
export class MaintenanceRunner {
	private readonly pool: Pool;
	private readonly intervalMs: number;
	private readonly firstDelayMs: number;
	private readonly log: (entry: Record<string, unknown>) => void;
	private timer: NodeJS.Timeout | null = null;
	private running: Promise<unknown> | null = null;
	constructor(options: MaintenanceRunnerOptions) {
		this.pool = options.pool;
		this.intervalMs = options.intervalMs;
		this.firstDelayMs = options.firstDelayMs ?? MAINTENANCE_FIRST_MS;
		this.log = options.log ?? ((entry) => console.log(JSON.stringify(entry)));
	}
	/** The schedule: the first run after the delay, then one per interval. */
	start(): void {
		if (this.intervalMs <= 0) return;
		this.timer = setTimeout(() => {
			this.timer = setInterval(() => this.tick(), this.intervalMs);
			this.timer.unref?.();
			this.tick();
		}, this.firstDelayMs);
		this.timer.unref?.();
	}
	/** The stop: the timer goes, and the run in flight is finished. */
	async stop(): Promise<void> {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		if (this.running) await this.running;
	}
	/** One run: the lock, the three steps, the report — ONE JSON line. */
	async runOnce(): Promise<MaintenanceReport> {
		const client = await this.pool.connect();
		try {
			const locked = await client.query<{ locked: boolean }>(LOCK_SQL, [MAINTENANCE_LOCK_KEY.toString()]);
			if (locked.rows[0]?.locked !== true) {
				this.log({ event: 'maintenance', skipped: 'locked' });
				return { skipped: 'locked' };
			}
			const steps: MaintenanceSteps = {};
			for (const step of STEPS) steps[step.name] = await this.step(client, step);
			const report: { steps: MaintenanceSteps; warn?: string } = { steps };
			if ((steps.ai_events_default_rows?.rows ?? 0) > 0) report.warn = DEFAULT_PARTITION_WARNING;
			this.log({ event: 'maintenance', ...report });
			return report;
		} finally {
			await client.query(UNLOCK_SQL, [MAINTENANCE_LOCK_KEY.toString()]).catch(() => undefined);
			client.release();
		}
	}
	/** One step: the function is asked for, then called with its default arguments, in its own transaction. */
	private async step(client: PoolClient, step: (typeof STEPS)[number]): Promise<MaintenanceStep> {
		let begun = false;
		try {
			const present = await client.query<{ present: boolean }>(PRESENT_SQL, [step.signature]);
			if (present.rows[0]?.present !== true) return { skipped: 'absent' };
			await client.query('BEGIN');
			begun = true;
			await client.query("set local statement_timeout = '60s'");
			const answer = await client.query(step.call);
			await client.query('COMMIT');
			return readStep(step.name, answer.rows[0]);
		} catch (error) {
			if (begun) await client.query('ROLLBACK').catch(() => undefined);
			return { error: errorText(error) };
		}
	}
	/** The scheduled run: the report is the line of the log. */
	private tick(): void {
		if (!this.timer || this.running) return;
		const done = (): void => { this.running = null; };
		this.running = this.runOnce()
			.catch((error: unknown) => this.log({ event: 'maintenance_failed', error: errorText(error) }))
			.finally(done);
	}
}

/** The first line of the message of an error, with its SQLSTATE. */
function errorText(error: unknown): string {
	const code = (error as { code?: string } | null)?.code ?? '';
	const message = (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';
	return code ? `${code} ${message}` : message;
}

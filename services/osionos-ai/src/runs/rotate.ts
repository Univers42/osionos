import type { Pool } from 'pg';
import { reserveTarget, settleTarget } from '../gateway/resolve.ts';
import type { ResolvedTarget } from '../gateway/resolve.ts';

/**
 * The rotation of a run from one model to the next: ONE transaction.
 *
 * 1. the old attempt settles what it cost;
 * 2. the next attempt reserves (when it bills the platform);
 * 3. the row of the run swaps its money and its model, if nobody else did.
 *
 * Three transactions would leave a window where a crash keeps the old
 * reservation in the day while the row says the new one, or the reverse; the
 * sweep of the stale runs then gives back money that is not there, and the
 * clamp of the ledger (`greatest(reserved - x, 0)`) takes it from OTHER runs
 * (devil C241, C246).
 */

export interface RotationSide {
	target: ResolvedTarget;
	/** What the side holds: the reservation up front plus the extensions. */
	reserved: number;
}

export interface RotationRequest {
	runId: string;
	userId: string;
	day: string;
	from: RotationSide & { billedMicroUsd: number };
	to: { target: ResolvedTarget; amount: number };
}

/**
 * `rotated`: the run now holds `to.amount`. `refused`: the next model cannot
 * be paid for; the old money is back and the row holds none, so the caller
 * only ends the run. `lost`: the row moved without us (the sweep, a cancel):
 * nothing was written, and the caller settles nothing, because the sweep
 * already did (devil C242).
 */
export type RotationOutcome = 'rotated' | 'refused' | 'lost';

export async function rotateReservation(db: Pool, request: RotationRequest): Promise<RotationOutcome> {
	const { runId, userId, day, from, to } = request;
	const client = await db.connect();
	try {
		await client.query('begin');
		await settleTarget(db, from.target, { userId, day, reserved: from.reserved, actual: from.billedMicroUsd }, client);
		// A refused reservation may have taken the user's side before the
		// platform's said no: the savepoint drops that half, and keeps the settle.
		await client.query('savepoint rotate_reserve');
		const taken = await reserveTarget(db, to.target, { userId, day, amount: to.amount }, client);
		if (!taken) await client.query('rollback to savepoint rotate_reserve');
		const held = taken && to.target.platformBudget ? to.amount : 0;
		const swapped = await client.query(
			`update public.ai_runs
			 set reserved_microusd = $3::bigint, model = case when $5::boolean then $4::text else model end
			 where id = $1 and status = 'running' and reserved_microusd = $2::bigint
			 returning id`,
			[runId, from.reserved, held, to.target.modelId, taken],
		);
		if (swapped.rowCount !== 1) {
			await client.query('rollback');
			return 'lost';
		}
		await client.query('commit');
		return taken ? 'rotated' : 'refused';
	} catch (error) {
		await client.query('rollback').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

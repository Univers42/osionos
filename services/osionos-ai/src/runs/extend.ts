import type { Pool } from 'pg';
import { reserveTarget } from '../gateway/resolve.ts';
import type { ResolvedTarget } from '../gateway/resolve.ts';

/**
 * The extension of the reservation of a run: ONE atomic reservation.
 *
 * The loop asks the ledger for more money when the step it is about to run
 * and the answer that follows it cost more than what the run holds. The
 * answer is what the run gives back at the end, so the money of the day and
 * the row of the run must agree at every moment.
 *
 * They agree because the two statements are in ONE transaction, on ONE
 * pooled client: a crash between them would keep the money reserved in the
 * day while the row of the run does not know about it, and the sweep of the
 * stale runs would never give it back.
 *
 * False means the ledger said no: the cap of the day is reached, and the
 * step that asked is the last one of the loop.
 */
export async function extendRunReservation(
	db: Pool,
	target: ResolvedTarget,
	{ userId, day, runId, amount }: { userId: string; day: string; runId: string; amount: number },
): Promise<boolean> {
	const client = await db.connect();
	try {
		await client.query('begin');
		const taken = await reserveTarget(db, target, { userId, day, amount }, client);
		if (!taken) {
			await client.query('rollback');
			return false;
		}
		// The row of the run carries the money it holds: the sweep of the
		// stale runs gives all of it back.
		await client.query(
			'update public.ai_runs set reserved_microusd = reserved_microusd + $2::bigint where id = $1',
			[runId, amount],
		);
		await client.query('commit');
		return true;
	} catch (error) {
		// The money of the day goes back with the transaction: a run that
		// cannot write its own row does not keep the money of the day.
		await client.query('rollback').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

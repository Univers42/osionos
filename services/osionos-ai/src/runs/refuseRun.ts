import type { Pool } from 'pg';
import { settleTarget } from '../gateway/resolve.ts';
import { markRun } from './repo.ts';

type Target = Parameters<typeof settleTarget>[1];
type Settle = Parameters<typeof settleTarget>[2];

/**
 * A run refused after its budget was reserved: the reservation is given back
 * whole (actual 0), the run row is marked failed with the code, and the
 * refusal outcome is returned for `startRun` to hand on.
 */
export async function refuseRun<S extends 404 | 503>(
	db: Pool,
	target: Target,
	settle: Settle,
	refusal: { runId: string; status: S; code: string },
): Promise<{ kind: 'refused'; status: S; code: string }> {
	await settleTarget(db, target, settle);
	await markRun(db, refusal.runId, 'failed', refusal.code);
	return { kind: 'refused', status: refusal.status, code: refusal.code };
}

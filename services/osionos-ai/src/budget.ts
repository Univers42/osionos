import type { Pool, PoolClient } from 'pg';

/**
 * The daily spend ledger.
 *
 * The protocol is the one the table comment carries (ai_usage_daily): a row per
 * (subject, day), a reservation added before the call and given back after it,
 * and a hard limit on spent + reserved.
 *
 * Two subjects are reserved at once: the user and the platform. They move in ONE
 * transaction, so a run is either paid for on both sides or on neither.
 */

/** The subject of the global breaker: the platform's own spend. */
export const PLATFORM_SUBJECT = 'platform';

export interface ReserveRequest {
	userId: string;
	day: string;
	amount: number;
	userLimit: number;
	platformLimit: number;
}

export interface SettleRequest {
	userId: string;
	day: string;
	reserved: number;
	actual: number;
}

/** The reservation on one subject: the row, then the conditional update. */
async function reserveOn(
	client: PoolClient,
	subject: string,
	day: string,
	amount: number,
	limit: number,
): Promise<boolean> {
	await client.query(
		`insert into public.ai_usage_daily (subject, day, spent_microusd, reserved_microusd)
		 values ($1, $2, 0, 0)
		 on conflict (subject, day) do nothing`,
		[subject, day],
	);
	// No row back means the limit is reached: spent + reserved + amount > limit.
	const updated = await client.query(
		`update public.ai_usage_daily
		 set reserved_microusd = reserved_microusd + $3::bigint
		 where subject = $1 and day = $2
		   and spent_microusd + reserved_microusd + $3::bigint <= $4::bigint
		 returning reserved_microusd`,
		[subject, day, amount, limit],
	);
	return updated.rowCount === 1;
}

/**
 * The reservation of a run, on the user and on the platform at once.
 *
 * False means the money is not there: the transaction is rolled back, so no
 * subject keeps a reservation the other one refused.
 */
export async function reserve(db: Pool, request: ReserveRequest): Promise<boolean> {
	const client = await db.connect();
	try {
		await client.query('begin');
		const onUser = await reserveOn(client, request.userId, request.day, request.amount, request.userLimit);
		if (!onUser) {
			await client.query('rollback');
			return false;
		}
		const onPlatform = await reserveOn(
			client,
			PLATFORM_SUBJECT,
			request.day,
			request.amount,
			request.platformLimit,
		);
		if (!onPlatform) {
			await client.query('rollback');
			return false;
		}
		await client.query('commit');
		return true;
	} catch (error) {
		await client.query('rollback').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

/** The settlement of one subject: the reservation back, the real spend in. */
async function settleOn(
	client: PoolClient,
	subject: string,
	day: string,
	reserved: number,
	actual: number,
): Promise<void> {
	// The ledger books the real spend, or the reservation when the real spend
	// is above it: the reservation IS the ceiling of the run, and a run that
	// books more than it reserved would spend money the cap never allowed.
	// The cost the upstream really charged stays in the row of the run.
	await client.query(
		`update public.ai_usage_daily
		 set reserved_microusd = greatest(reserved_microusd - $3::bigint, 0),
		     spent_microusd = spent_microusd + least($4::bigint, $3::bigint)
		 where subject = $1 and day = $2`,
		[subject, day, reserved, actual],
	);
}

/**
 * The settlement of a run: the reservation becomes the real spend. The actual
 * cost may differ from the reservation, in both directions: the reservation was
 * an estimate and the upstream is the one that knows.
 *
 * The ledger books the actual cost, and never more than the reservation: the
 * reservation is the ceiling of the run, and the cap was checked against it.
 * A run that costs more than it reserved (the estimate counts four characters
 * per token, and it under-counts) is booked at its reservation; the cost the
 * upstream really charged is in the row of the run.
 */
export async function settle(db: Pool, request: SettleRequest): Promise<void> {
	const client = await db.connect();
	try {
		await client.query('begin');
		await settleOn(client, request.userId, request.day, request.reserved, request.actual);
		await settleOn(client, PLATFORM_SUBJECT, request.day, request.reserved, request.actual);
		await client.query('commit');
	} catch (error) {
		await client.query('rollback').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

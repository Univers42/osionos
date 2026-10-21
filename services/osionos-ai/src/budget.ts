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
	// The ledger books the REAL spend. The money is spent whatever the ledger
	// says, so a ledger that books less than the upstream charged lies to the
	// daily caps and to the platform breaker: the key spends over its cap
	// while the ledger says it did not.
	// The reservation is the ceiling of the LOOP, and the loop stops itself
	// when it reaches it (src/runs/streamPump.ts): the ceiling is kept by
	// stopping the work, never by under-booking what was paid.
	await client.query(
		`update public.ai_usage_daily
		 set reserved_microusd = greatest(reserved_microusd - $3::bigint, 0),
		     spent_microusd = spent_microusd + $4::bigint
		 where subject = $1 and day = $2`,
		[subject, day, reserved, actual],
	);
}

/**
 * The settlement of a run: the reservation becomes the real spend. The actual
 * cost may differ from the reservation, in both directions: the reservation was
 * an estimate and the upstream is the one that knows.
 *
 * The ledger books the actual cost, always. A run that costs more than it
 * reserved (the estimate counts four characters per token, and it under-counts)
 * books what it really cost: the caps read this ledger, and a cap that reads
 * a smaller number is a cap that does not hold. The cost the upstream really
 * charged is in the row of the run too.
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

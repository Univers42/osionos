import type { Redis } from 'ioredis';
import { secondsUntilUtcMidnight, utcDay } from '../voice/quota.ts';

/**
 * The images of a UTC day: one count per user, one for the whole platform
 * (devil C75).
 *
 * The count is taken before the money moves, and given back when the image is
 * refused before the engine is called: a refusal does not spend the user's
 * day. The keys are here, and not in the route, so a test can read them
 * without importing the configuration of the service.
 */

/** The key of a user's images of a day. */
export function imageDayKey(userId: string, day: string): string {
	return `ai:img:day:${userId}:${day}`;
}

/** The key of the platform's images of a day. */
export function imageGlobalDayKey(day: string): string {
	return `ai:img:day:all:${day}`;
}

export type DaySeat =
	| { kind: 'taken'; giveBack: () => Promise<void> }
	| { kind: 'refused'; retryAfterSeconds: number };

/**
 * One image of the day, for the user and for the platform at once.
 *
 * Both counters move up in one transaction, and both come back down when
 * either is over its cap: the counts stay exact with any number of replicas,
 * at the price of a refusal that may briefly hold a seat it then gives back.
 */
export async function takeDaySeat(
	redis: Redis,
	userId: string,
	limits: { perUser: number; global: number },
	now: Date,
	// Other features count their own day: the keys are the only difference.
	keys: { user: (userId: string, day: string) => string; global: (day: string) => string } = {
		user: imageDayKey,
		global: imageGlobalDayKey,
	},
): Promise<DaySeat> {
	const day = utcDay(now);
	const userKey = keys.user(userId, day);
	const globalKey = keys.global(day);
	// The counters of a day die with it.
	const midnight = Math.floor(now.getTime() / 1000) + secondsUntilUtcMidnight(now);
	const results = await redis
		.multi()
		.incr(userKey)
		.expireat(userKey, midnight)
		.incr(globalKey)
		.expireat(globalKey, midnight)
		.exec();
	const userCount = Number(results?.[0]?.[1] ?? 0);
	const globalCount = Number(results?.[2]?.[1] ?? 0);
	const giveBack = async (): Promise<void> => {
		await redis.multi().decr(userKey).decr(globalKey).exec();
	};
	if (userCount > limits.perUser || globalCount > limits.global) {
		await giveBack();
		return { kind: 'refused', retryAfterSeconds: secondsUntilUtcMidnight(now) };
	}
	return { kind: 'taken', giveBack };
}

/**
 * The counters of the dictation: the lock of the one call at a time, and the
 * seconds of the day.
 *
 * The keys live next to the run's rate limit (`ai:rl:`), in the same Redis, and
 * they are here — and not in the route — so a test can read them without
 * importing the configuration of the service.
 */

/** The key of the lock: one dictation at a time, per user. */
export function voiceLockKey(userId: string): string {
	return `ai:voice:lock:${userId}`;
}

/** The key of the seconds of a day, per user. */
export function voiceSecondsKey(userId: string, day: string): string {
	return `ai:voice:sec:${userId}:${day}`;
}

/** The day of a moment, in UTC: the counter of the day is the counter of the UTC day. */
export function utcDay(now: Date): string {
	return now.toISOString().slice(0, 10);
}

/** The seconds until the next UTC midnight: the `Retry-After` of an exhausted day. */
export function secondsUntilUtcMidnight(now: Date): number {
	const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
	return Math.max(1, Math.ceil((midnight - now.getTime()) / 1000));
}

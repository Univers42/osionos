import { setTimeout as sleep } from 'node:timers/promises';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { accountRestSeconds, recordFailure } from './cooldown.ts';
import { failedAttemptCost, failoverClassOf, kindOf, startAttempt } from './attempt.ts';
import type { Attempt, AttemptRecord, ChainStep } from './attempt.ts';
import { classifyFailure } from './failover.ts';
import { rotateReservation } from './rotate.ts';
import { quotaSignal, spendsSharedQuota } from './quota.ts';
import type { PumpOutcome } from './streamPump.ts';

/**
 * The step of the chain: a failed attempt, and what the run does next.
 *
 * `stay`: the failure ends the run as it did before failover existed (no model
 * waits, something was emitted, a cancel, a failure off the allowlist, or the
 * row moved under us). `refused`: the next model cannot be paid for, and the
 * money of the old one is already back. `moved`: the next attempt, with its
 * `route` frame already in the stream, and where it sits in the chain.
 * `retry`: the same attempt once more, after the pause.
 */
export type MoveOutcome = { kind: 'stay' } | { kind: 'refused' } | { kind: 'retry' } | { kind: 'moved'; attempt: Attempt; index: number };

export interface MoveInput {
	db: Pool;
	redis: Redis;
	run: Parameters<typeof startAttempt>[1];
	steps: readonly ChainStep[];
	index: number;
	current: Attempt;
	outcome: PumpOutcome;
	records: AttemptRecord[];
	emit: (type: string, data: unknown) => Promise<void>;
}

/**
 * The next step the failure lets the run take. A limit of the account, or one
 * that may be, leaves only the routes off the shared quota: every free route
 * after it would be one more rejected call. Read after `recordFailure`, so a
 * rest another run wrote stops this walk too.
 */
async function nextIndex(input: MoveInput): Promise<number> {
	const { steps, index, current, outcome } = input;
	const signal = spendsSharedQuota(current.target) ? quotaSignal(outcome.error)?.kind : undefined;
	const closed = signal === 'account' || signal === 'ambiguous' || (await accountRestSeconds(input.redis)) !== undefined;
	return steps.findIndex((step, position) => position > index && !(closed && spendsSharedQuota(step.target)));
}

/**
 * A run with one route has no chain to absorb a blip, so it gets ONE retry. Not
 * after anything was emitted (a tool would run twice), not on a limit, a timeout
 * or a cancel, and not while the account rests.
 */
async function retriesOnce({ steps, records, current, outcome, run, redis }: MoveInput): Promise<boolean> {
	if (steps.length !== 1 || records.length > 0 || outcome.emitted) return false;
	if (run.signal.aborted || current.controller.signal.aborted) return false;
	const reason = classifyFailure(outcome.error)?.reason;
	if (reason !== 'upstream_error' && reason !== 'unavailable') return false;
	return (await accountRestSeconds(redis)) === undefined;
}

/**
 * 1 to 3 s, jittered so runs that failed together do not come back together.
 *
 * Caveat: a blip longer than the pause still ends the run, and a run the user
 * cancels here ends at once with `cancelled`. The value is a guess, not measured.
 */
async function backoff(signal: AbortSignal): Promise<void> {
	await sleep(1000 + Math.random() * 2000, undefined, { signal }).catch(() => undefined);
}

export async function moveOn(input: MoveInput): Promise<MoveOutcome> {
	const { db, run, steps, current, outcome, records } = input;
	// Before the move is decided: a model that failed rests even when the run
	// has nowhere to go (devil C256: the failure allowlist, not a timeout or a cancel).
	if (outcome.error !== undefined) {
		await recordFailure(input.redis, {
			target: current.target,
			userId: run.userId,
			error: outcome.error,
			attemptAborted: current.controller.signal.aborted,
		});
	}
	const nextAt = await nextIndex(input);
	const failure = failoverClassOf(outcome, {
		hasNext: nextAt >= 0,
		attempts: records.length + 1,
		runSignal: run.signal,
		attemptSignal: current.controller.signal,
	});
	if (!failure) {
		if (outcome.error === undefined || !(await retriesOnce(input))) return { kind: 'stay' };
		records.push({ model: current.target.modelId, kind: kindOf(current.target), outcome: 'retried', billed: 0 });
		await backoff(run.signal);
		return run.signal.aborted ? { kind: 'stay' } : { kind: 'retry' };
	}
	const next = steps[nextAt];
	const billed = failedAttemptCost(current.target, failure, outcome.usage, run.runId, run.promptChars);
	const rotated = await rotateReservation(db, {
		runId: run.runId,
		userId: run.userId,
		day: run.day,
		from: { target: current.target, reserved: current.budget.reserved, billedMicroUsd: billed },
		to: next,
	});
	if (rotated === 'lost') return { kind: 'stay' };
	records.push({ model: current.target.modelId, kind: kindOf(current.target), outcome: failure.reason, billed });
	if (rotated === 'refused') return { kind: 'refused' };
	// The frame comes BEFORE the next attempt's first one, so a client that
	// reconnects replays the move (devil C260).
	await input.emit('route', { from: current.target.modelId, to: next.target.modelId, reason: failure.reason });
	return { kind: 'moved', attempt: startAttempt(db, run, next), index: nextAt };
}

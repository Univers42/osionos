import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { accountRestSeconds, recordFailure } from './cooldown.ts';
import { failedAttemptCost, failoverClassOf, kindOf, startAttempt } from './attempt.ts';
import type { Attempt, AttemptRecord, ChainStep } from './attempt.ts';
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
 */
export type MoveOutcome = { kind: 'stay' } | { kind: 'refused' } | { kind: 'moved'; attempt: Attempt; index: number };

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
	if (!failure) return { kind: 'stay' };
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

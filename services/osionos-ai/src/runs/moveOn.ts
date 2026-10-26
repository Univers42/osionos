import type { Pool } from 'pg';
import { failedAttemptCost, failoverClassOf, kindOf, startAttempt } from './attempt.ts';
import type { Attempt, AttemptRecord, ChainStep } from './attempt.ts';
import { rotateReservation } from './rotate.ts';
import type { PumpOutcome } from './streamPump.ts';

/**
 * The step of the chain: a failed attempt, and what the run does next.
 *
 * `stay`: the failure ends the run as it did before failover existed (no model
 * waits, something was emitted, a cancel, a failure off the allowlist, or the
 * row moved under us). `refused`: the next model cannot be paid for, and the
 * money of the old one is already back. `moved`: the next attempt, with its
 * `route` frame already in the stream.
 */
export type MoveOutcome = { kind: 'stay' } | { kind: 'refused' } | { kind: 'moved'; attempt: Attempt };

export interface MoveInput {
	db: Pool;
	run: { signal: AbortSignal; runId: string; userId: string; day: string; promptChars: number };
	steps: readonly ChainStep[];
	index: number;
	current: Attempt;
	outcome: PumpOutcome;
	records: AttemptRecord[];
	emit: (type: string, data: unknown) => Promise<void>;
}

export async function moveOn(input: MoveInput): Promise<MoveOutcome> {
	const { db, run, steps, index, current, outcome, records } = input;
	const failure = failoverClassOf(outcome, {
		hasNext: index + 1 < steps.length,
		attempts: records.length + 1,
		runSignal: run.signal,
		attemptSignal: current.controller.signal,
	});
	if (!failure) return { kind: 'stay' };
	const next = steps[index + 1];
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
	return { kind: 'moved', attempt: startAttempt(db, run, next) };
}

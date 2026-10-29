import type { LanguageModelUsage } from 'ai';
import type { Pool } from 'pg';
import { costMicroUsd } from '../gateway/platform.ts';
import type { ResolvedTarget } from '../gateway/resolve.ts';
import { usageForSettlement } from '../gateway/usage.ts';
import { classifyFailure } from './failover.ts';
import type { FailoverClass } from './failover.ts';
import { mergeProviderOptions, reasoningOptions } from './effort.ts';
import type { Effort, ProviderOptionsFragment } from './effort.ts';
import { extendRunReservation } from './extend.ts';
import { clock } from '../tools/limits.ts';
import type { RunLimits } from '../tools/limits.ts';
import type { LoopBudget } from './loopBudget.ts';
import { abortCode } from './streamPump.ts';
import type { PumpOutcome } from './streamPump.ts';

/**
 * One attempt of a run: a target, the money it holds, its own clock.
 *
 * A run is a chain of at most three attempts. Only the CURRENT attempt holds
 * money and only it settles; its step-0 extensions are part of its own
 * reservation (devil C244). The cancel controller belongs to the run; every
 * attempt gets a fresh one that follows it, so a timeout of one attempt never
 * aborts the next (devil C252).
 */

/** A model a run may use, and the amount it reserves when the run moves to it. */
export interface ChainStep {
	target: ResolvedTarget;
	amount: number;
}

/** What `ai_runs.usage.attempts` records for one attempt (devil C261). */
export interface AttemptRecord {
	model: string;
	/** Whose money the attempt spends: the platform's, or the user's own provider. */
	kind: 'platform' | 'user';
	outcome: string;
	billed: number;
}

export interface Attempt {
	target: ResolvedTarget;
	budget: LoopBudget;
	controller: AbortController;
}

/** At most this many attempts per run, for ONE rate-limit token (devil C251). */
export const MAX_ATTEMPTS = 3;

export function startAttempt(
	db: Pool,
	run: {
		signal: AbortSignal;
		runId: string;
		userId: string;
		day: string;
		promptChars: number;
		/** A research run: its bounds and the moment it started (C399, C400). */
		limits?: RunLimits;
		startedAt?: number;
	},
	step: ChainStep,
): Attempt {
	const controller = new AbortController();
	if (run.signal.aborted) controller.abort(run.signal.reason);
	else run.signal.addEventListener('abort', () => controller.abort(run.signal.reason), { once: true });
	const { target } = step;
	const budget: LoopBudget = {
		reserved: step.amount,
		pricing: target.pricing,
		baseChars: run.promptChars,
		runId: run.runId,
		...(run.limits ? { limits: run.limits, startedAt: run.startedAt ?? clock.now() } : {}),
		extend: (amount: number) =>
			extendRunReservation(db, target, { userId: run.userId, day: run.day, runId: run.runId, amount }),
	};
	return { target, budget, controller };
}

/**
 * The provider options of ONE target: the data-collection deny of a platform
 * vision call, and the effort of a model that reasons. Recomputed per target
 * (devil C253): a fallback never inherits the primary's wire options.
 */
export function providerOptionsFor(
	target: ResolvedTarget,
	imageCount: number,
	effort: Effort | undefined,
): ProviderOptionsFragment | undefined {
	const visionDeny: ProviderOptionsFragment = target.platformBudget && imageCount > 0
		? { platform: { provider: { data_collection: 'deny' } } }
		: {};
	const merged = mergeProviderOptions(visionDeny, reasoningOptions(target, effort));
	return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * Whether a failed attempt hands the run to the next model: a model waits,
 * nothing reached the client, the run is not cancelled and the failure is on
 * the allowlist (devil C248, C249, C252).
 */
export function failoverClassOf(
	outcome: PumpOutcome,
	state: { hasNext: boolean; attempts: number; runSignal: AbortSignal; attemptSignal: AbortSignal },
): FailoverClass | null {
	if (!state.hasNext || state.attempts >= MAX_ATTEMPTS) return null;
	if (outcome.error === undefined || outcome.emitted) return null;
	if (state.runSignal.aborted) return null;
	// The clock of THIS attempt ran out before a word came: the model is stuck,
	// and the next one has a fresh clock (devil C249, C252). The upstream never
	// said whether it worked, so the attempt is booked at the estimate.
	if (state.attemptSignal.aborted) {
		return abortCode(state.attemptSignal) === 'timeout' ? { reason: 'unavailable', billing: 'estimate' } : null;
	}
	return classifyFailure(outcome.error);
}

/**
 * What a failed attempt of a chain is booked at (devil C245): the usage the
 * upstream reported; else nothing for a 429 or a 5xx, where the upstream
 * says it did no work; else the estimate of the prompt it received.
 */
export function failedAttemptCost(
	target: ResolvedTarget,
	failure: FailoverClass | null,
	reported: LanguageModelUsage | undefined,
	runId: string,
	promptChars: number,
): number {
	if (!reported && failure?.billing === 'none') return 0;
	return costMicroUsd(target.pricing, usageForSettlement(runId, reported, { promptChars, outputChars: 0 }));
}

/**
 * The `attempts` of `ai_runs.usage` (devil C261): present only when the run
 * moved at least once, so a run that never moved writes the row it always did.
 */
export function attemptsUsage(
	records: readonly AttemptRecord[],
	last?: { target: ResolvedTarget; outcome: string; billed: number },
): { attempts?: AttemptRecord[] } {
	if (records.length === 0) return {};
	const tail = last ? [{ model: last.target.modelId, kind: kindOf(last.target), outcome: last.outcome, billed: last.billed }] : [];
	return { attempts: [...records, ...tail] };
}

export function kindOf(target: ResolvedTarget): 'platform' | 'user' {
	return target.platformBudget ? 'platform' : 'user';
}

import { costMicroUsd } from '../gateway/platform.ts';
import type { PlatformModelEntry } from '../gateway/platform.ts';
import { usageForSettlement } from '../gateway/usage.ts';
import { MAX_STEPS } from '../tools/loop.ts';
import { stepCeilingMicroUsd, stepPromptChars } from './estimate.ts';

/**
 * The budget of the loop: the money a run holds, and the ceiling of a step.
 *
 * The reservation of a run is NOT the cost of the whole loop: the loop takes
 * the money as it goes. The run holds two step ceilings up front (the first
 * step, and the answer that must follow it), and every step after that asks
 * the ledger for what it needs — ONE atomic extension, refused or not.
 *
 * Two rules make it a ceiling.
 *
 * **No step starts without the money of the step AND of the answer.** The
 * money the run still holds (reserved − accrued) must cover the ceiling of
 * the step and the ceiling of the answer that follows it; when it does not,
 * the run asks the ledger for the missing money, once.
 *
 * **The step that is going to be the last one runs without tools.** The
 * model answers with what it has, and the run ends with an answer instead of
 * a tool call nobody reads.
 */

/** What the loop reads of a finished step. */
export interface StepUsage {
	/** What the provider reported of the step. */
	usage?: { inputTokens?: number; outputTokens?: number };
	/** The text of the step, when the SDK gives it as one string. */
	text?: unknown;
	/** The parts of the step, when it gives them as parts. */
	content?: unknown;
}

/** The budget of a run: the money it holds, and what a step of it costs. */
export interface LoopBudget {
	/** The money the run holds, in micro-USD. The loop tops it up when it needs more. */
	reserved: number;
	/** The pricing of the model: the cost of a step is read from it. */
	pricing: PlatformModelEntry;
	/** The characters of the prompt of a step, without the tools. */
	baseChars: number;
	/** The id of the run: the estimate of a step carries it. */
	runId: string;
	/**
	 * One atomic extension of the reservation.
	 *
	 * False means the ledger said no: the cap of the day is reached, and the
	 * step that asked is the last one of the loop.
	 */
	extend?: (amount: number) => Promise<boolean>;
}

/**
 * The characters the tools of a step put in the context of the next one.
 *
 * The outputs of the tools accumulate: the prompt of a step holds every one
 * of them, and the pool of the run is what keeps them inside the ceiling.
 */
export function toolOutputChars(step: StepUsage): number {
	let chars = 0;
	for (const part of Array.isArray(step.content) ? step.content : []) {
		const output = (part as { output?: unknown }).output;
		if (typeof output === 'string') chars += output.length;
	}
	return chars;
}

/** The characters the model wrote in a step. */
function stepTextChars(step: StepUsage): number {
	if (typeof step.text === 'string') return step.text.length;
	let chars = 0;
	for (const part of Array.isArray(step.content) ? step.content : []) {
		const text = (part as { text?: unknown }).text;
		if (typeof text === 'string') chars += text.length;
	}
	return chars;
}

/** What the steps that ran cost, and what they left in the context. */
export interface StepsLedger {
	/** The cost of the steps that ran. */
	accrued: number;
	/** The characters the tools put in the context of the next step. */
	pool: number;
	/** The ceiling of the last step that ran. */
	lastCeiling: number;
}

/**
 * The steps that ran, and what they cost.
 *
 * The cost of a step is the usage the provider reported, and the estimate
 * when it reported nothing: the estimate of a step is the same estimate the
 * settlement uses, so the two never disagree.
 */
export function stepsLedger(budget: LoopBudget, steps: readonly StepUsage[]): StepsLedger {
	let accrued = 0;
	let pool = 0;
	let lastCeiling = 0;
	for (const step of steps) {
		const promptChars = stepPromptChars(budget.baseChars, pool);
		lastCeiling = stepCeilingMicroUsd(budget.pricing, promptChars);
		const usage = usageForSettlement(
			budget.runId,
			step.usage,
			{ promptChars, outputChars: stepTextChars(step) },
			// The estimate of a step is not a settlement: the line that says
			// the usage was estimated belongs to the settlement, which books
			// it once.
			{ log: false },
		);
		accrued += costMicroUsd(budget.pricing, usage);
		pool += toolOutputChars(step);
	}
	return { accrued, pool, lastCeiling };
}

/**
 * The stop condition of the money: the loop stops when the money the run
 * holds cannot cover one more step.
 *
 * The ceiling of the comparison is the ceiling of the step that just ran:
 * the loop paid for that one, and the money that is left has to cover one
 * like it. The answer that follows a step is a step like it.
 */
export function budgetReached(budget: LoopBudget) {
	return ({ steps }: { steps: readonly StepUsage[] }): boolean => {
		const { accrued, lastCeiling } = stepsLedger(budget, steps);
		return accrued + lastCeiling > budget.reserved;
	};
}

/**
 * The decision of a step: does it call tools, or is it the answer?
 *
 * The step that is going to be the last one of the loop runs WITHOUT tools:
 * the model must answer with what it has. It is the last one when the loop
 * stops (the cap of the steps), or when the money of the run cannot cover
 * this step AND the answer that follows it.
 */
export async function stepHasTools(
	budget: LoopBudget,
	{ stepNumber, steps }: { stepNumber: number; steps: readonly StepUsage[] },
): Promise<boolean> {
	// The cap of the steps: the last step of the loop is the answer.
	if (stepNumber >= MAX_STEPS - 1) return false;

	const { accrued, pool } = stepsLedger(budget, steps);
	// The money the run still holds.
	const held = budget.reserved - accrued;
	// The ceiling of this step, and of the answer that follows it.
	const ceiling = stepCeilingMicroUsd(budget.pricing, stepPromptChars(budget.baseChars, pool));
	const needed = ceiling * 2;
	if (held >= needed) return true;

	// The money is missing: the run asks the ledger for it, ONCE. The
	// reservation is atomic, so two runs never share it.
	const missing = needed - held;
	if (budget.extend && (await budget.extend(missing))) {
		budget.reserved += missing;
		return true;
	}
	// The ledger said no: this step is the answer, and the money of the
	// answer is already held.
	return false;
}

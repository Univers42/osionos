import { config } from '../config.ts';
import { costMicroUsd } from '../gateway/platform.ts';
import type { PlatformModelEntry } from '../gateway/platform.ts';
import { estimateTokens } from '../gateway/usage.ts';
import { TOOL_DEFINITION_CHARS, TOOL_OUTPUT_CHARS, TOOL_POOL_CHARS } from '../tools/index.ts';
import { SYSTEM_PROMPT } from './prompt.ts';

/**
 * The estimate of a call: what the prompt is expected to cost.
 *
 * The reservation and the settlement of a call read the size of the prompt
 * from here, so the two never disagree.
 */

/**
 * The characters of the prompt of a call: the question, the history, the pages
 * the run quotes, the sources it found, and the system prompt.
 */
export function promptCharCount({
	text,
	historyChars,
	pageChars = 0,
	sourceChars = 0,
}: {
	text: string;
	historyChars: number;
	pageChars?: number;
	sourceChars?: number;
}): number {
	return text.length + historyChars + pageChars + sourceChars + SYSTEM_PROMPT.length;
}

/**
 * The characters of the prompt of ONE step of the loop.
 *
 * The prompt of the run, the outputs of the tools (the pool), and the
 * definitions of the tools: the three are input on every step of the loop.
 */
export function stepPromptChars(baseChars: number, toolOutputChars = 0): number {
	return baseChars + toolOutputChars + TOOL_DEFINITION_CHARS;
}

/**
 * The reservation of a call: what the prompt is expected to cost.
 *
 * Caveat: the input tokens are estimated at four characters per token, which
 * under-counts CJK and code-heavy text. The estimate is a ceiling for the
 * reservation, not a bill: the settlement corrects it with the usage the
 * upstream reports.
 */
export function estimateMicroUsd(
	model: PlatformModelEntry,
	{
		text,
		historyChars,
		pageChars = 0,
		sourceChars = 0,
	}: {
		text: string;
		historyChars: number;
		pageChars?: number;
		sourceChars?: number;
	},
): number {
	const estimatedInputTokens = estimateTokens(promptCharCount({ text, historyChars, pageChars, sourceChars }));
	return costMicroUsd(model, { inputTokens: estimatedInputTokens, outputTokens: config.maxOutputTokens });
}

/**
 * The ceiling of ONE step of the loop: what the step may cost.
 *
 * The prompt it sends is the input, and the output it may write is the
 * output: the ceiling of a step is what the step costs at its worst.
 */
export function stepCeilingMicroUsd(model: PlatformModelEntry, promptChars: number): number {
	return costMicroUsd(model, {
		inputTokens: estimateTokens(promptChars),
		outputTokens: config.maxOutputTokens,
	});
}

/** The two ceilings of a step: the step, and the answer that follows it. */
export interface StepCeilings {
	/** The ceiling of the step itself. */
	step: number;
	/** The ceiling of the answer that follows it. */
	answer: number;
	/** The two of them: what the run must hold to start the step. */
	needed: number;
}

/**
 * The two ceilings of a step: the step, and the answer that follows it.
 *
 * The answer reads what the tools of the step add: the prompt of the answer
 * holds the pool of the run AND the share of the step that follows it (the
 * tools of a step may add TOOL_OUTPUT_CHARS to the context, whatever the
 * number of the calls they make). The ceiling of the answer is therefore the
 * ceiling of a step whose prompt holds the pool and that share.
 *
 * The two numbers live here, and nowhere else: the runner reserves them up
 * front, and the loop asks the ledger for them before every step.
 */
export function stepCeilingsMicroUsd(
	model: PlatformModelEntry,
	{ baseChars, pool = 0 }: { baseChars: number; pool?: number },
): StepCeilings {
	const step = stepCeilingMicroUsd(model, stepPromptChars(baseChars, pool));
	// What the tools of the next step may add to the context: the share of a
	// step, or what is left of the pool of the run, whichever is smaller.
	const growth = Math.min(TOOL_OUTPUT_CHARS, Math.max(TOOL_POOL_CHARS - pool, 0));
	const answer = stepCeilingMicroUsd(model, stepPromptChars(baseChars, pool + growth));
	return { step, answer, needed: step + answer };
}

/**
 * The reservation of a run, up front: the first step, and the answer that
 * follows it.
 *
 * A run that reserves for one call and spends five books a spend the cap
 * never allowed (the devil's condition C13), and a run that reserves for
 * five worst cases at once is refused before it starts: with a platform
 * model, the reservation of a five-step loop is five times what a "hello"
 * costs, and the cap of the day is smaller than that.
 *
 * So the run holds what its first step needs and what its answer needs, and
 * the steps after that ask the ledger for what they need, one at a time
 * (`src/runs/loopBudget.ts`). The answer of the first step reads what the
 * tools of that step add, so its ceiling is the one of a step whose prompt
 * holds the share of a step (`stepCeilingsMicroUsd`).
 */
export function estimateRunMicroUsd(
	model: PlatformModelEntry,
	{
		text,
		historyChars,
		pageChars = 0,
		sourceChars = 0,
	}: {
		text: string;
		historyChars: number;
		pageChars?: number;
		sourceChars?: number;
	},
): number {
	const base = promptCharCount({ text, historyChars, pageChars, sourceChars });
	return stepCeilingsMicroUsd(model, { baseChars: base }).needed;
}

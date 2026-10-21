import { config } from '../config.ts';
import { costMicroUsd } from '../gateway/platform.ts';
import type { PlatformModelEntry } from '../gateway/platform.ts';
import { estimateTokens } from '../gateway/usage.ts';
import { TOOL_DEFINITION_CHARS } from '../tools/index.ts';
import { MAX_STEPS, TOOL_POOL_CHARS } from '../tools/loop.ts';
import { SYSTEM_PROMPT } from './prompt.ts';

/**
 * The estimate of a call: what the prompt is expected to cost.
 *
 * The reservation and the settlement of a call read the size of the prompt
 * from here, so the two never disagree.
 */

/**
 * The characters the tools of a run may add to the context of a step.
 *
 * The pool of the outputs of the tools, and the definitions the tools are
 * sent as: both are input, on every step of the loop.
 */
export const TOOL_CHARS = TOOL_POOL_CHARS + TOOL_DEFINITION_CHARS;

/**
 * The characters of the prompt of a call: the question, the history, the pages
 * the run quotes, the sources it found, and the system prompt.
 */
export function promptCharCount({
	text,
	historyChars,
	pageChars = 0,
	sourceChars = 0,
	toolChars = 0,
}: {
	text: string;
	historyChars: number;
	pageChars?: number;
	sourceChars?: number;
	toolChars?: number;
}): number {
	return text.length + historyChars + pageChars + sourceChars + toolChars + SYSTEM_PROMPT.length;
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
		toolChars = 0,
	}: {
		text: string;
		historyChars: number;
		pageChars?: number;
		sourceChars?: number;
		toolChars?: number;
	},
): number {
	const estimatedInputTokens = estimateTokens(
		promptCharCount({ text, historyChars, pageChars, sourceChars, toolChars }),
	);
	return costMicroUsd(model, { inputTokens: estimatedInputTokens, outputTokens: config.maxOutputTokens });
}

/**
 * The reservation of a run: the ceiling of the WHOLE loop.
 *
 * A run is not one call: the model may call a tool, and the answer comes
 * after the tool. A run that reserves for one call and spends five books a
 * spend the cap never allowed, so the reservation is the cost of every step
 * the loop may take.
 *
 * Every step is counted with the pool of the tools and with their
 * definitions: the outputs of the tools accumulate, so the prompt of the
 * last step holds all of them, and the definitions are input on every step.
 * The pool is what keeps that true: with it, the prompt of a step never
 * holds more than the step the reservation counts, and the reservation is a
 * ceiling of the loop.
 */
export function estimateLoopMicroUsd(
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
	return (
		MAX_STEPS *
		estimateMicroUsd(model, {
			text,
			historyChars,
			pageChars,
			sourceChars,
			toolChars: TOOL_CHARS,
		})
	);
}

/**
 * The ceiling of the characters one step of the loop may hold.
 *
 * It is the prompt of the run, the pool of the tools and the definitions of
 * the tools: the loop stops itself when the next step would cost more than
 * the run holds, and the cost of a step is read from this ceiling.
 */
export function stepCeilingChars(baseChars: number): number {
	return baseChars + TOOL_CHARS;
}

import { stepCountIs, streamText } from 'ai';
import type { LanguageModel, LanguageModelUsage, ModelMessage, ToolSet } from 'ai';
import { config } from '../config.ts';
import { DEFAULT_RUN_LIMITS } from '../tools/limits.ts';
import type { ToolPool } from '../tools/index.ts';
import { markOwnError } from './failover.ts';
import { stepHasTools } from './loopBudget.ts';
import type { LoopBudget, StepUsage } from './loopBudget.ts';
import { SYSTEM_PROMPT } from './prompt.ts';

/**
 * The pump of the upstream: the model's stream, turned into the events of a
 * run, with the two clocks that stop it.
 *
 * The clock of the idle time (no part for thirty seconds) and the clock of the
 * whole call (two minutes) both abort the same signal, so the caller can tell
 * a timeout from a cancellation.
 *
 * The MONEY is not a clock of the loop: it is decided before every step
 * (`prepareStep`), and a step the run cannot pay for becomes the answer.
 * The loop itself is bounded by the cap of the steps alone.
 */

/** No part for thirty seconds: the upstream is stuck. */
export const IDLE_TIMEOUT_MS = 30_000;
/** Two minutes for the whole call. */
export const TOTAL_TIMEOUT_MS = 120_000;

/** What the SDK does when no value is passed (ai 7.0.139, index.js:2658), spelled out. */
const SDK_DEFAULT_RETRIES = 2;

/** The abort of a timeout: the reason of the signal says so. */
export class UpstreamTimeout extends Error {
	constructor() {
		super('the upstream did not answer in time');
		this.name = 'timeout';
	}
}

/**
 * Why the signal is aborted: a timeout, a cancellation, or nothing at all.
 *
 * The reason of the signal is the marker: the timeout aborts with its own
 * error, a cancellation aborts with the default one.
 */
export function abortCode(signal: AbortSignal): 'timeout' | 'cancelled' | null {
	if (!signal.aborted) return null;
	const reason = signal.reason as { name?: unknown } | null;
	return reason?.name === 'timeout' ? 'timeout' : 'cancelled';
}

/** The short message of a failure: never the body of the upstream. */
export function failureMessage(code: string, error: unknown): string {
	if (code === 'cancelled') return 'the run was cancelled';
	if (code === 'timeout') return 'the upstream did not answer in time';
	return failureName(error);
}

/** The name of a failure, and nothing else: no upstream body reaches the client. */
function failureName(error: unknown): string {
	const name = (error as { name?: unknown } | null)?.name;
	if (typeof name === 'string' && name.length > 0) return name.slice(0, 64);
	return 'upstream_error';
}

/**
 * The ceiling of the loop: the money the run holds, and the cost of a step.
 *
 * The reservation of a run is the ceiling of the whole loop, and the ceiling
 * is kept by the DECISION of every step: the steps that ran are paid for
 * whatever they cost, and the next one is not started with tools when it
 * would pass the money the run holds — it becomes the answer instead.
 */
export type { LoopBudget };

/**
 * The override of the SDK's download: it refuses.
 *
 * The SDK downloads the URL of a part it does not have the bytes of. The
 * images of a run are bytes the service fetched itself, through the bridge,
 * and a URL must never leave the service: the download is refused, and the
 * run that asked for one fails.
 */
export function refuseDownload(options: readonly unknown[]): Promise<never[]> {
	if (Array.isArray(options) && options.length === 0) return Promise.resolve([]);
	return Promise.reject(new Error('url_download_disabled'));
}

export interface PumpInput {
	/** The handle of the model: the platform's, or the one of a connection. */
	model: LanguageModel;
	/**
	 * The system prompt of the run.
	 *
	 * It is the base one, or the one of an agent: the agent's block comes
	 * before the data-boundary line, which is always last (devil C38).
	 */
	system?: string;
	messages: ModelMessage[];
	/** Extra body fields forwarded to the upstream. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	providerOptions?: Record<string, any>;
	/** The signal of the call: the caller owns it, so it can cancel the run. */
	controller: AbortController;
	/** A piece of the answer. */
	onText: (text: string) => Promise<void>;
	/** A piece of the reasoning, when the model streams one. */
	onReasoning: (text: string) => Promise<void>;
	/**
	 * The tools the model may call.
	 *
	 * Without them the loop is one step: the model answers, and the run is
	 * over. With them the model may call a tool, and the answer comes after
	 * the tool: that is the loop, and it is bounded by MAX_STEPS.
	 */
	tools?: ToolSet;
	/**
	 * The ceiling of the loop, when the call is one that may loop.
	 *
	 * Without it the loop is bounded by the steps alone: a call that holds no
	 * money has no ceiling to stop at.
	 */
	budget?: LoopBudget;
	/**
	 * The pool of the tools of the run: the share of the step is given back
	 * before every step, so one step adds at most TOOL_OUTPUT_CHARS to the
	 * context of the run.
	 */
	pool?: ToolPool;
	/** The model called a tool. */
	onToolCall?: (call: { toolCallId: string; toolName: string; input: unknown }) => Promise<void>;
	/** A tool failed before it ran: the model never gets an answer of it. */
	onToolError?: (failure: { toolCallId: string; toolName: string }) => Promise<void>;
	/** The SDK's retries on a 429 or 5xx; 0 when a next model waits (devil C250). */
	maxRetries?: number;
	/** A step is about to run; `hasTools` is false when it is the answer (research C412). */
	onStepStart?: (step: { stepNumber: number; hasTools: boolean }) => Promise<void>;
	/** A step ended, after its tool calls and its text (research C402, C407). */
	onStepFinish?: (step: { stepNumber: number }) => Promise<void>;
}

export interface PumpOutcome {
	answer: string;
	reasoning: string;
	usage?: LanguageModelUsage;
	finishReason: string;
	/**
	 * The money the run holds: the reservation up front and the extensions
	 * of the loop. The settlement gives all of it back.
	 */
	reserved: number;
	/** The failure, when the stream broke. */
	error?: unknown;
	/** Anything reached the callbacks, or a step finished: a run may not move to another model. */
	emitted: boolean;
}

/**
 * The separator between two steps of the loop: markdown needs a blank line to
 * start a new paragraph, so the text of a step begins on a line of its own.
 *
 * Nothing is added when the answer is empty (the first step) or when it
 * already ends with a blank line: the separator is only the missing break.
 */
export function stepSeparator(answer: string): string {
	if (answer.length === 0) return '';
	if (answer.endsWith('\n\n')) return '';
	if (answer.endsWith('\n')) return '\n';
	return '\n\n';
}

/**
 * The call to the model, and nothing else: no budget, no row, no event.
 *
 * The failure never escapes: the caller gets it in the outcome, with the usage
 * the upstream reported before it broke — that is what the settlement needs.
 */
export async function pumpUpstream(input: PumpInput): Promise<PumpOutcome> {
	const { model, messages, controller, onText, onReasoning, tools, budget, pool, onToolCall, onToolError } = input;
	// The system prompt of the run: the base one, or the one of the agent.
	const system = input.system ?? SYSTEM_PROMPT;
	let answer = '';
	let reasoning = '';
	let usage: LanguageModelUsage | undefined;
	let finishReason = 'stop';
	let idleTimer: ReturnType<typeof setTimeout> | undefined;
	let totalTimer: ReturnType<typeof setTimeout> | undefined;
	// The step that ended: the text of the step that follows it is another
	// paragraph, and not the end of the sentence before it.
	let stepEnded = false;
	// Set BEFORE a callback is awaited: one that throws has still shown something.
	let emitted = false;
	let stepsFinished = 0;

	// The one clock of the loop: the steps. The money never stops it: a step
	// the run cannot pay for becomes the ANSWER (prepareStep), so a run
	// never ends with a tool call nobody reads.
	const limits = budget?.limits ?? DEFAULT_RUN_LIMITS;
	const stopWhen = [stepCountIs(limits.maxSteps)];

	// The step that is going to be the LAST one runs without tools: the
	// model answers with what it has, and the run ends with an answer
	// instead of a tool call nobody reads. The decision is the budget's:
	// the cap of the steps, or the money of the day.
	//
	// `toolChoice: 'none'` and not `activeTools: []`: the first one is
	// honoured by the SDK on EVERY wire — the OpenAI-compatible one sends
	// `tool_choice: "none"`, the Anthropic one sends `{type: "none"}` — and
	// it says what it means on the wire. The second one only drops the
	// tools from the request, and the request then says nothing at all
	// about them.
	const prepareStep = budget || pool
		? async ({ stepNumber, steps }: { stepNumber: number; steps: readonly StepUsage[] }) => {
				// The step begins: the tools of this step share ONE budget,
				// whatever the number of the calls they make.
				pool?.startStep();
				if (!budget) return undefined;
				try {
					const hasTools = await stepHasTools(budget, { stepNumber, steps });
					await input.onStepStart?.({ stepNumber, hasTools });
					return hasTools ? undefined : { toolChoice: 'none' as const };
				} catch (error) {
					// The ledger failed, not the upstream.
					markOwnError(error);
					throw error;
				}
			}
		: undefined;

	const onTimeout = () => controller.abort(new UpstreamTimeout());
	const touch = () => {
		if (idleTimer) clearTimeout(idleTimer);
		idleTimer = setTimeout(onTimeout, IDLE_TIMEOUT_MS);
	};
	const clearTimers = () => {
		if (idleTimer) clearTimeout(idleTimer);
		if (totalTimer) clearTimeout(totalTimer);
	};

	try {
		// Caveat: a research run that fails over starts the deadline again for
		// the next model, so it may run up to 8 minutes per attempt.
		totalTimer = setTimeout(onTimeout, limits.deadlineMs ?? TOTAL_TIMEOUT_MS);
		touch();

		const result = streamText({
			model,
			system,
			messages,
			maxOutputTokens: config.maxOutputTokens,
			abortSignal: controller.signal,
			maxRetries: input.maxRetries ?? SDK_DEFAULT_RETRIES,
			// The SDK must never fetch a URL: the images are bytes we fetched.
			experimental_download: refuseDownload,
			...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
			// The tools, and the ceiling of the loop: the model may call a
			// tool, and the answer comes after the tool.
			...(tools ? { tools } : {}),
			stopWhen,
			...(prepareStep ? { prepareStep } : {}),
		});

		for await (const part of result.fullStream) {
			touch();
			if (part.type === 'text-delta') {
				// The text of a step that follows another one begins on a
				// line of its own: the two answers are two paragraphs.
				const separator = stepEnded && answer.length > 0 ? stepSeparator(answer) : '';
				// The break is used once: the rest of the step belongs to the
				// paragraph its first text opened.
				stepEnded = false;
				const text = separator + part.text;
				answer += text;
				emitted = true;
				await onText(text);
			} else if (part.type === 'reasoning-delta') {
				reasoning += part.text;
				emitted = true;
				await onReasoning(part.text);
			} else if (part.type === 'tool-call') {
				emitted = true;
				await onToolCall?.({ toolCallId: part.toolCallId, toolName: part.toolName, input: part.input });
			} else if (part.type === 'tool-error') {
				emitted = true;
				await onToolError?.({ toolCallId: part.toolCallId, toolName: part.toolName });
			} else if (part.type === 'finish-step') {
				usage = part.usage;
				stepEnded = true;
				emitted = true;
				await input.onStepFinish?.({ stepNumber: stepsFinished });
				stepsFinished += 1;
			} else if (part.type === 'finish') {
				usage = part.totalUsage;
				finishReason = part.finishReason;
			} else if (part.type === 'error') {
				throw part.error;
			} else if (part.type === 'abort') {
				throw new Error('aborted');
			}
		}
		return { answer, reasoning, usage, finishReason, reserved: budget?.reserved ?? 0, emitted };
	} catch (error) {
		return { answer, reasoning, usage, finishReason, reserved: budget?.reserved ?? 0, error, emitted };
	} finally {
		clearTimers();
	}
}

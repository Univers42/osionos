import { MAX_STEPS, TOOL_OUTPUT_CHARS, TOOL_POOL_CHARS } from './loop.ts';

/**
 * The bounds of ONE run's tool loop, as a value instead of module constants.
 *
 * Research mode needs a longer loop than the chat's. The loop is the same
 * code, so the bounds are passed in: the default is exactly today's
 * constants, and a run that passes nothing behaves as it always did.
 * Imports only `loop.ts`, so it cannot be part of a cycle.
 */
export interface RunLimits {
	/** The steps of the loop; the last one is always the answer. */
	maxSteps: number;
	/** What the tools of one step may add to the context. */
	stepChars: number;
	/** What the tools of the whole run may add to the context. */
	poolChars: number;
	/** After this many ms from run.started a step is the answer. Unset: no clock. */
	answerAfterMs?: number;
	/** The whole call is aborted after this many ms. Unset: the pump's own total. */
	deadlineMs?: number;
}

export const DEFAULT_RUN_LIMITS: RunLimits = {
	maxSteps: MAX_STEPS,
	stepChars: TOOL_OUTPUT_CHARS,
	poolChars: TOOL_POOL_CHARS,
};

/**
 * Research (C400, C399): 12 steps, 10 000 characters a step, 110 000 a run;
 * no tool after 6.5 minutes, nothing at all after 8.
 *
 * Caveat: the 6.5 minutes are measured from the first step, so a model that
 * needs more than 90 s for the answer itself is cut at 8 minutes with
 * `timeout`. The answer is written on the text the run already has.
 */
export const RESEARCH_LIMITS: RunLimits = {
	maxSteps: 12,
	stepChars: 10_000,
	poolChars: 110_000,
	answerAfterMs: 6.5 * 60_000,
	deadlineMs: 8 * 60_000,
};

/** The searches and the fetches of a research run (C400). */
export const RESEARCH_WEB_CAPS = { searches: 16, fetches: 24 } as const;

/** The clock of the research deadline: a test moves it instead of waiting. */
export const clock = { now: (): number => Date.now() };

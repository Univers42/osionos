import { clock } from '../tools/limits.ts';
import type { PumpInput } from '../runs/streamPump.ts';

/**
 * The events and the log of ONE research run (C402, C407, C408, C412).
 *
 * A research answer is long, and a token-sized `text.delta` is one Redis
 * entry each: the stream keeps ~2000, so a long report would push its own
 * head out. The text is held back until it is 200 characters, and flushed at
 * every tool call and step end so the order of the events never changes.
 *
 * Caveat: the phase of `research.progress` is inferred from the tools the
 * PREVIOUS step called (the model has not chosen yet), so it says what the
 * run just did, one step late, and a step that mixes searches and fetches
 * reads as `read`. The 200 characters are UTF-16 units, so a CJK answer
 * flushes at fewer visible characters.
 */

export const COALESCE_CHARS = 200;
/** The queries `research.plan` carries: the first step cannot make more than this many useful ones. */
const PLAN_QUERIES = 8;

export type ResearchPhase = 'plan' | 'search' | 'read' | 'write';

interface Counters {
	searches: number;
	fetches: number;
	bytes?: number;
}

export interface ResearchSession {
	/** The pump callbacks that replace the chat's: coalesced text, plan, progress. */
	readonly hooks: Pick<PumpInput, 'onText' | 'onToolCall' | 'onStepStart' | 'onStepFinish'>;
	/** Sends what is held back; the caller does it after the pump returns, error or not. */
	flush(): Promise<void>;
	/** Records how the run ended; the log line is written once by `log`. */
	end(code: string, deadlineHit: boolean): void;
	/** One JSON line, counts only: never a query, a URL or a word of a page (C408). */
	log(): void;
}

export function createResearchSession(input: {
	emit: (type: string, data: unknown) => Promise<void>;
	counters: () => Counters | undefined;
	maxSteps: number;
	startedAt: number;
}): ResearchSession {
	const { emit } = input;
	let held = '';
	let planned = false;
	let steps = 0;
	let code = 'upstream_error';
	let deadlineHit = false;
	let logged = false;
	let calls: { name: string; input: unknown }[] = [];
	let previous: readonly { name: string }[] = [];

	const flush = async (): Promise<void> => {
		if (held.length === 0) return;
		const text = held;
		held = '';
		await emit('text.delta', { text });
	};

	const phaseOf = (hasTools: boolean): ResearchPhase => {
		if (!hasTools) return 'write';
		if (steps === 1) return 'plan';
		return previous.some((call) => call.name === 'web_search') ? 'read' : 'search';
	};

	return {
		hooks: {
			onText: async (text) => {
				held += text;
				if (held.length >= COALESCE_CHARS) await flush();
			},
			onToolCall: async ({ toolCallId, toolName, input: toolInput }) => {
				await flush();
				calls.push({ name: toolName, input: toolInput });
				await emit('tool.called', { toolCallId, toolName, input: toolInput });
			},
			onStepStart: async ({ stepNumber, hasTools }) => {
				steps = stepNumber + 1;
				const counters = input.counters();
				await emit('research.progress', {
					step: steps,
					maxSteps: input.maxSteps,
					searches: counters?.searches ?? 0,
					fetches: counters?.fetches ?? 0,
					phase: phaseOf(hasTools),
				});
			},
			onStepFinish: async ({ stepNumber }) => {
				await flush();
				if (stepNumber === 0 && !planned) {
					const queries = calls.flatMap((call) => {
						const query = (call.input as { query?: unknown } | null)?.query;
						return call.name === 'web_search' && typeof query === 'string' ? [query] : [];
					});
					if (queries.length > 0) {
						planned = true;
						await emit('research.plan', { queries: queries.slice(0, PLAN_QUERIES) });
					}
				}
				previous = calls;
				calls = [];
			},
		},
		flush,
		end(finalCode, hit) {
			code = finalCode;
			deadlineHit = hit;
		},
		log() {
			if (logged) return;
			logged = true;
			const counters = input.counters();
			console.info(
				JSON.stringify({
					event: 'research_run',
					steps,
					searches: counters?.searches ?? 0,
					fetches: counters?.fetches ?? 0,
					bytes: counters?.bytes ?? 0,
					ms: clock.now() - input.startedAt,
					code,
					deadline_hit: deadlineHit,
				}),
			);
		},
	};
}

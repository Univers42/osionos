import { asSchema } from 'ai';
import type { ToolSet } from 'ai';
import type { z } from 'zod';
import type { RetrievedChunk } from '../retrieval/search.ts';
import type { PermissionAsked } from '../approvals/types.ts';
import { READ_TOOLS } from './readTools.ts';
import { writeTools } from './writeToolList.ts';
import type { AnyProposalTool, AnyReadTool, ReadToolContext } from './types.ts';
import { MAX_STEPS, TOOL_OUTPUT_CHARS, TOOL_POOL_CHARS } from './loop.ts';
import { rememberTool } from './memoryTools.ts';
import { loadSkillTool } from './skillTools.ts';
import { numberSources, sourceKey, type ToolSource } from '../runs/sources.ts';

export { MAX_STEPS, TOOL_OUTPUT_CHARS, TOOL_POOL_CHARS };

/**
 * The tools of the assistant, and what the run hears of them.
 *
 * The tool set is built per run: it holds the context of the caller and the
 * counter of the sources, so the sources of a run are numbered once, from the
 * first one, whatever step they came from.
 *
 * It holds the pool of the run too: the tools of a run may not put more in
 * its context than the reservation of the run counted.
 */

/** What the run hears of a tool that ran. */
export interface ToolOutcome {
	/** The id of the call: the answer of the tool carries it. */
	toolCallId: string;
	/** The name of the tool. */
	toolName: string;
	/** Whether the tool did its work. */
	ok: boolean;
	/** Why it did not, when it did not. */
	error?: string;
	/**
	 * How many passages a read tool found, the ones the run had already cited
	 * included: those are not cited again, so the citations alone undercount.
	 */
	found?: number;
	/** The memory a `remember` call proposed: the run emits `memory.proposed` for it (C42). */
	memoryId?: string;
	/** The trimmed text the proposal stored; it travels with `memoryId`. */
	memoryBody?: string;
	/** The skill a `load_skill` call loaded: pinned in the history of the run (devil C40). */
	skill?: { id: string; version: number; source: 'builtin' | 'workspace' };
}

export type { ToolSource };

/** What the tool set tells the run while it runs. */
export interface ToolHooks {
	/**
	 * The sources the prompt already quoted.
	 *
	 * They are [1], [2], [3]… in that order, and a source a tool finds that
	 * is one of them keeps the number it was given.
	 */
	citedSources: readonly RetrievedChunk[];
	/**
	 * A source the tools found: the run emits it as a citation.
	 *
	 * The call that found it is named: the client credits the passage to
	 * the call it came from.
	 */
	onSources?(sources: readonly ToolSource[], toolCallId: string): void | Promise<void>;
	/** The outcome of a tool: the run emits it as an event. */
	onResult?(outcome: ToolOutcome): void | Promise<void>;
	/**
	 * The run asked the user for the right to write.
	 *
	 * The run emits it as `permission.asked`, and it ends with the reason
	 * `awaiting_approval`: the approval row is what waits, not the run.
	 */
	onApproval?(asked: PermissionAsked): void | Promise<void>;
}

/**
 * The text a tool gives the model when the pool of the run is spent.
 *
 * It is the end of the reading: the model answers with what it has.
 */
export const POOL_SPENT = 'The reading budget of this answer is used up: answer with what you have.';

/**
 * The pool of a run: what the tools may still put in its context.
 *
 * The pool belongs to ONE run: it is created with the tool set of the run,
 * and it is never shared between two runs.
 *
 * The pool holds the notice back: the text that tells the model its reading
 * budget is spent is paid for by the pool as well, so the context of a run
 * never grows past the ceiling the reservation counted.
 */
export interface ToolPool {
	/** Whether the pool still holds room for the output of a tool. */
	readonly spent: boolean;
	/**
	 * The step begins: the tools of this step share ONE budget.
	 *
	 * A step may call ten tools at once, and the answer that follows reads
	 * all of them: the share of the step (TOOL_OUTPUT_CHARS) is what keeps
	 * the context of a run inside the ceiling the reservation counted. The
	 * calls that come after the share is used up get the notice of the pool.
	 */
	startStep(): void;
	/** The output of a tool, cut to the room the pool has left. */
	draw(text: string): string;
	/** The notice, paid for by the pool: nothing when it does not fit. */
	notice(): string;
}

/**
 * The pool of a run, with the characters it may hold.
 *
 * A tool that has no room left does not run: the model is told to answer
 * with what it has, and the run goes on. A tool that starts while the pool
 * still has room, and finds it empty when it comes back, is told the same:
 * the output of a tool that the pool cannot hold is dropped, not truncated
 * to nothing.
 *
 * The pool has two counters: the room of the run, and the share of the step
 * that is running. The share is given back at every step (`startStep`), and
 * it is what the reservation of a run counts: one step adds at most
 * TOOL_OUTPUT_CHARS to the context, whatever the number of the calls it
 * makes.
 */
export function createToolPool(chars: number = TOOL_POOL_CHARS): ToolPool {
	let left = chars;
	// The share of the step: the tools of ONE step may not add more than
	// TOOL_OUTPUT_CHARS to the context of the run. It is empty until the
	// step begins, so a pool that is never started gives nothing away.
	let stepLeft = 0;
	/** The notice, paid for by the pool: nothing when it does not fit. */
	const notice = (): string => {
		if (left < POOL_SPENT.length) return '';
		left -= POOL_SPENT.length;
		return POOL_SPENT;
	};
	return {
		get spent(): boolean {
			return left <= POOL_SPENT.length;
		},
		startStep(): void {
			stepLeft = TOOL_OUTPUT_CHARS;
		},
		draw(text: string): string {
			// The pool ran out while the tool worked.
			if (left <= POOL_SPENT.length) return notice();
			// The share of the step is used up: the call gets the notice of
			// the pool, and the context of the run grows by the notice and by
			// nothing else.
			if (stepLeft <= 0) return notice();
			const room = Math.min(text.length, TOOL_OUTPUT_CHARS, stepLeft, left - POOL_SPENT.length);
			const cut = text.slice(0, room);
			left -= cut.length;
			stepLeft -= cut.length;
			return cut;
		},
		notice,
	};
}

/**
 * The characters the definitions of the tools take in a prompt.
 *
 * The tools are sent on every step of the loop: their name, their
 * description and their schema of arguments are input, and the reservation
 * has to count them. The number is computed once, from the tool set, and it
 * never changes: the registry is frozen.
 *
 * The write tools, `load_skill` (offered only to an agent with skills) and `remember` are counted even when they are not registered (a
 * deployment without a bridge URL): the count is a ceiling, and a ceiling
 * that depends on the deployment is a ceiling that is wrong somewhere.
 * The one exception is `build_plan` (its schema is large): it is counted only
 * when OSIONOS_AI_BUILDERS is on, the one case where it is sent.
 */
export const TOOL_DEFINITION_CHARS = toolDefinitionChars([...READ_TOOLS, ...writeTools(), loadSkillTool([]), rememberTool({ workspaceId: '', runId: '' })]);

/** The shape the count of the definitions reads. */
interface ToolDefinition {
	name: string;
	description: string;
	input: z.ZodType<unknown>;
}

/** The length of the JSON the tools are sent as. */
function toolDefinitionChars(tools: readonly ToolDefinition[]): number {
	const definitions = tools.map((tool) => ({
		type: 'function',
		function: {
			name: tool.name,
			description: tool.description,
			parameters: asSchema(tool.input).jsonSchema,
		},
	}));
	return JSON.stringify(definitions).length;
}

/**
 * The tools the model may call, in the shape the SDK calls them.
 *
 * A tool never throws: a tool that fails answers with the reason, and the
 * model decides what to do with it. A tool that throws would end the step in
 * an error the model never sees.
 *
 * The pool is the one of the run: the caller holds it, so it can start the
 * steps of the loop (the share of a step is given back at every step).
 */
export function readToolSet(
	ctx: ReadToolContext,
	hooks: ToolHooks,
	pool: ToolPool = createToolPool(),
	extra: readonly (AnyReadTool | AnyProposalTool)[] = [],
): ToolSet {
	// The sources of the run are numbered once: the ones of the prompt
	// first, then the ones the tools find, in the order the tools found
	// them. A passage the run already quoted keeps its number.
	const numbers = new Map<string, number>();
	hooks.citedSources.forEach((source, index) => numbers.set(sourceKey(source), index + 1));
	let quoted = hooks.citedSources.length;
	const set: ToolSet = {};
	for (const tool of [...READ_TOOLS, ...extra]) {
		set[tool.name] = {
			description: tool.description,
			inputSchema: tool.input,
			execute: async (rawInput: unknown, options: { toolCallId: string }) => {
				// The pool is spent: the tool does not run, and the model is
				// told to answer with what it has.
				if (pool.spent) {
					await hooks.onResult?.({
						toolCallId: options.toolCallId,
						toolName: tool.name,
						ok: false,
						error: 'the reading budget of the answer is used up',
					});
					return pool.notice();
				}
				const parsed = tool.input.safeParse(rawInput);
				if (!parsed.success) {
					await hooks.onResult?.({
						toolCallId: options.toolCallId,
						toolName: tool.name,
						ok: false,
						error: 'the arguments do not fit the tool',
					});
					return pool.draw(
						'The arguments of this call do not fit the tool. Call it again with the arguments it takes.',
					);
				}
				let result;
				try {
					result = await tool.run(ctx, parsed.data);
				} catch {
					result = { ok: false as const, error: 'the tool failed' };
				}
				if (!result.ok) {
					await hooks.onResult?.({
						toolCallId: options.toolCallId,
						toolName: tool.name,
						ok: false,
						error: result.error,
					});
					return pool.draw(result.error);
				}
				// The numbering and the commit of it are ONE stretch with no
				// await: the calls of a step interleave at the awaits only, so
				// two calls never give one number twice.
				const { cites, fresh } = numberSources(tool.sources(result.data), numbers, quoted);
				const output = pool.draw(tool.render(result.data, cites));
				// The pool ran out while the tool worked: the model reads the
				// notice, and the sources the tool found are not cited — the
				// model never read them.
				if (output === POOL_SPENT || output.length === 0) {
					await hooks.onResult?.({
						toolCallId: options.toolCallId,
						toolName: tool.name,
						ok: false,
						error: 'the reading budget of the answer is used up',
					});
					return output;
				}
				// The numbers are committed: these passages keep them.
				for (const { n, source } of fresh) numbers.set(sourceKey(source), n);
				quoted += fresh.length;
				if (fresh.length > 0) {
					await hooks.onSources?.(fresh, options.toolCallId);
				}
				await hooks.onResult?.({
					toolCallId: options.toolCallId,
					toolName: tool.name,
					ok: true,
					found: cites.length,
					...(tool.pin ? { skill: tool.pin(result.data) } : {}),
					...('proposed' in tool && tool.proposed
						? { memoryId: tool.proposed(result.data).id, memoryBody: tool.proposed(result.data).body }
						: {}),
				});
				return output;
			},
		};
	}
	return set;
}

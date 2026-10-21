import type { ToolSet } from 'ai';
import type { RetrievedChunk } from '../retrieval/search.ts';
import { READ_TOOLS } from './readTools.ts';
import type { ReadToolContext } from './types.ts';

export { MAX_STEPS, TOOL_OUTPUT_CHARS } from './loop.ts';

/**
 * The tools of the assistant, and what the run hears of them.
 *
 * The tool set is built per run: it holds the context of the caller and the
 * counter of the sources, so the sources of a run are numbered once, from the
 * first one, whatever step they came from.
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
}

/** A source the tools found, and the number the answer cites it by. */
export interface ToolSource {
	/** The number of the source: the answer cites it as [n]. */
	n: number;
	/** The source itself. */
	source: RetrievedChunk;
}

/** What the tool set tells the run while it runs. */
export interface ToolHooks {
	/**
	 * The number the first source of the run got.
	 *
	 * The sources of the prompt are quoted before the model speaks, so they
	 * are [1], [2], [3]… The sources a tool finds continue the numbering.
	 */
	firstSourceNumber: number;
	/** A source the tools found: the run emits it as a citation. */
	onSources?(sources: readonly ToolSource[]): void | Promise<void>;
	/** The outcome of a tool: the run emits it as an event. */
	onResult?(outcome: ToolOutcome): void | Promise<void>;
}

/**
 * The tools the model may call, in the shape the SDK calls them.
 *
 * A tool never throws: a tool that fails answers with the reason, and the
 * model decides what to do with it. A tool that throws would end the step in
 * an error the model never sees.
 */
export function readToolSet(ctx: ReadToolContext, hooks: ToolHooks): ToolSet {
	// The sources of the run are numbered once: the ones of the prompt first,
	// then the ones the tools find, in the order the tools found them.
	let quoted = hooks.firstSourceNumber;
	const set: ToolSet = {};
	for (const tool of READ_TOOLS) {
		set[tool.name] = {
			description: tool.description,
			inputSchema: tool.input,
			execute: async (rawInput: unknown, options: { toolCallId: string }) => {
				const parsed = tool.input.safeParse(rawInput);
				if (!parsed.success) {
					await hooks.onResult?.({
						toolCallId: options.toolCallId,
						toolName: tool.name,
						ok: false,
						error: 'the arguments do not fit the tool',
					});
					return 'The arguments of this call do not fit the tool. Call it again with the arguments it takes.';
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
					return result.error;
				}
				const sources = tool.sources(result.data);
				const first = quoted + 1;
				quoted += sources.length;
				if (sources.length > 0) {
					await hooks.onSources?.(sources.map((source, index) => ({ n: first + index, source })));
				}
				await hooks.onResult?.({ toolCallId: options.toolCallId, toolName: tool.name, ok: true });
				return tool.render(result.data, first);
			},
		};
	}
	return set;
}

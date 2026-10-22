import type { Pool } from 'pg';
import type { ToolSet } from 'ai';
import { config } from '../config.ts';
import { readToolSet } from '../tools/index.ts';
import type { ToolOutcome, ToolPool } from '../tools/index.ts';
import { writeToolSet } from '../approvals/toolSet.ts';
import type { ApprovalContext, PermissionAsked } from '../approvals/types.ts';
import type { RetrievedChunk } from '../retrieval/search.ts';
import type { AuthUser } from '../auth.ts';
import type { PageContext } from './prompt.ts';
import type { BuiltinAgent } from '../agents/builtins.ts';

/**
 * The tools of a run.
 *
 * The reads come first: the search of a workspace, and the read of a page.
 * They read the workspace of the caller, and they carry NO token: a read tool
 * has no use for one.
 *
 * The WRITES come after, when the bridge is configured: they ask the user for
 * the right to write, and they write nothing. Without a bridge URL they are
 * not registered at all, and the reads keep working.
 *
 * The tool set knows three things about the run: the sources it found (they
 * are the citations of the answer), the pages it read or quoted (they are the
 * provenance of an approval), and whether it asked the user (that is the
 * finish reason of the run).
 */

/** What the tools of a run tell the run. */
export interface RunTools {
	/** The tools the model may call, or nothing when the run has no caller. */
	tools: ToolSet | undefined;
	/** The sources of the run: the ones of the prompt, then the ones the tools found. */
	readonly cited: RetrievedChunk[];
	/** Whether the run asked the user for the right to write. */
	awaitingApproval: boolean;
	/**
	 * The writes the run asked for: one card each.
	 *
	 * The approval id is what a client keeps: the card is drawn again from it
	 * when the stream of the run is gone.
	 */
	readonly permissions: readonly PermissionAsked[];
}

/** The tools of a run, and what they know of it. */
export function buildRunTools(input: {
	db: Pool;
	user?: AuthUser;
	pool: ToolPool;
	runId: string;
	conversationId: string;
	ownerId: string;
	/** The pages the client quoted: the run reads them in its prompt. */
	pages: readonly PageContext[];
	/** The sources of the prompt: they are cited before the first word. */
	sources: readonly RetrievedChunk[];
	/**
	 * The agent of the run, or none.
	 *
	 * None is the general assistant: every tool of the runtime, as today. An
	 * agent narrows them to its own list — it never gains one, and the write
	 * tools it keeps stay behind the approval of the user.
	 */
	agent?: BuiltinAgent | null;
	/** The event of the run. */
	emit: (type: string, data: unknown) => Promise<void>;
}): RunTools {
	const { db, user, pool, runId, conversationId, ownerId, pages, sources, emit } = input;
	const agent = input.agent ?? null;
	const cited: RetrievedChunk[] = [...sources];
	const permissions: PermissionAsked[] = [];
	const run: RunTools = { tools: undefined, cited, awaitingApproval: false, permissions };

	const hooks = {
		citedSources: sources,
		onSources: async (
			found: readonly { n: number; source: RetrievedChunk }[],
			toolCallId: string,
		) => {
			// Pushed before the first await: the calls of a step interleave at
			// the awaits, and the list must stay in the order of the numbers
			// (the stored part of a source is its number minus one).
			cited.push(...found.map(({ source }) => source));
			for (const { n, source } of found) {
				await emit('citation', {
					n,
					pageId: source.pageId,
					...(source.blockId ? { blockId: source.blockId } : {}),
					title: source.title,
					snippet: source.snippet,
					// The call that found the passage: the client credits
					// it to that call, and to no other.
					toolCallId,
				});
			}
		},
		onResult: async (outcome: ToolOutcome) => {
			await emit('tool.result', outcome);
		},
		onApproval: async (asked: PermissionAsked) => {
			run.awaitingApproval = true;
			permissions.push(asked);
			await emit('permission.asked', asked);
		},
	};

	const approval: ApprovalContext = {
		runId,
		conversationId,
		ownerId,
		// The pages the run had read or quoted: where the request comes
		// from. It grows as the run reads more.
		provenance: () => [
			...new Set([...pages.map((page) => page.id), ...cited.map((source) => source.pageId)]),
		],
	};

	run.tools = user
		? {
				...readToolSet({ db, user }, hooks, pool),
				...(config.bridgeUrl ? writeToolSet({ db, user }, hooks, pool, approval) : {}),
			}
		: undefined;
	// The agent narrows the tools: the set of the run is the intersection of
	// what the runtime offers and what the agent may call. An agent never
	// gains a tool, and a tool the agent does not list is not even sent to
	// the model — it is not in the request.
	if (run.tools && agent) {
		const allowed = new Set(agent.tools);
		const kept: ToolSet = {};
		for (const [name, tool] of Object.entries(run.tools)) {
			if (allowed.has(name)) kept[name] = tool;
		}
		run.tools = kept;
	}
	return run;
}

import type { LanguageModelUsage, ModelMessage } from 'ai';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { config } from '../config.ts';
import { costMicroUsd } from '../gateway/platform.ts';
import { settleTarget } from '../gateway/resolve.ts';
import type { ResolvedTarget } from '../gateway/resolve.ts';
import { usageForSettlement } from '../gateway/usage.ts';
import type { SettledUsage } from '../gateway/usage.ts';
import { appendMessage } from '../conversations/repo.ts';
import { markRun } from './repo.ts';
import type { RunStatus } from './repo.ts';
import * as runStore from './runStore.ts';
import { buildUserTurn, historyChars, historyMessages, quotedPageChars } from './prompt.ts';
import { promptCharCount } from './estimate.ts';
import { extendRunReservation } from './extend.ts';
import type { LoopBudget } from './loopBudget.ts';
import { sourceChars } from './sources.ts';
import { readToolSet, createToolPool } from '../tools/index.ts';
import type { ToolOutcome } from '../tools/index.ts';
import { writeToolSet } from '../approvals/toolSet.ts';
import type { ApprovalContext, PermissionAsked } from '../approvals/types.ts';
import type { HistoryMessage, PageContext } from './prompt.ts';
import type { RetrievedChunk } from '../retrieval/search.ts';
import type { AuthUser } from '../auth.ts';
import { abortCode, failureMessage, pumpUpstream } from './streamPump.ts';

/**
 * The upstream of a run: the model call, the events, the settlement.
 *
 * Every event goes through the stream first, so a client that reconnects sees
 * exactly what the first client saw, and then to the live response.
 */

/** One event of a run, as the client sees it. */
export interface RunEvent {
	id: string;
	type: string;
	data: unknown;
}

/** What the upstream of a run needs to do its work. */
export interface UpstreamRunInput {
	db: Pool;
	redis: Redis;
	runId: string;
	conversationId: string;
	ownerId: string;
	text: string;
	/** Where the model is called, and who pays for it. */
	target: ResolvedTarget;
	emit: (event: RunEvent) => void;
	/** The day of the ledger, and the money the run holds. */
	day: string;
	reserved: number;
	history: HistoryMessage[];
	pages: readonly PageContext[];
	/** The sources of the answer: the chunks the retrieval found. */
	sources: readonly RetrievedChunk[];
	/**
	 * The caller, when the run has one.
	 *
	 * The tools of the assistant read the workspace of the caller, so a run
	 * without a caller has no tools: it answers with what it was given.
	 */
	user?: AuthUser;
	skippedPageIds: readonly string[];
	userMessageId: string;
	/** The title of the conversation: the first frame carries it. */
	title: string;
}

/**
 * The run itself: the model call, the events, the settlement.
 */
export async function runUpstream(input: UpstreamRunInput): Promise<void> {
	const {
		db,
		redis,
		runId,
		conversationId,
		ownerId,
		text,
		target,
		day,
		reserved,
		history,
		pages,
		sources,
		user,
		skippedPageIds,
		userMessageId,
		title,
	} = input;

	const controller = new AbortController();
	runStore.trackRun(runId, controller);

	/** The event, in the stream and in the live response. */
	const emit = async (type: string, data: unknown): Promise<void> => {
		const id = await runStore.append(redis, runId, type, data);
		input.emit({ id, type, data });
	};

	let answer = '';
	let reasoning = '';
	let usage: LanguageModelUsage | undefined;
	let settled: SettledUsage | undefined;
	let finishReason = 'stop';
	// The run asked the user for the right to write: it ends with the reason
	// 'awaiting_approval', and the APPROVAL ROW is what waits. The run itself
	// is terminal, so the conversation may carry on.
	let awaitingApproval = false;
	// The size of the prompt, for the estimate of a provider that reports
	// nothing: the reservation reads it from the same place.
	const promptChars = promptCharCount({
		text,
		historyChars: historyChars(history),
		pageChars: quotedPageChars(pages),
		sourceChars: sourceChars(sources),
	});
	// The budget of the loop: the money the run holds, and the ceiling of a
	// step. The loop asks the ledger for what it needs, one extension at a
	// time, and the extension is atomic: two runs never share it.
	const budget: LoopBudget = {
		reserved,
		pricing: target.pricing,
		baseChars: promptChars,
		runId,
		extend: (amount: number) => extendRunReservation(db, target, { userId: ownerId, day, runId, amount }),
	};
	// The pool of the tools of THIS run: the tools of a run may not put
	// more in its context than the reservation of the run counted, and one
	// step may not add more than a step's share of it.
	const pool = createToolPool();

	try {
		await emit('run.started', {
			runId,
			conversationId,
			model: target.modelId,
			userMessageId,
			skippedPageIds: [...skippedPageIds],
			conversationTitle: title,
			retrievedCount: sources.length,
		});

		// The sources of the answer: one frame each, in the order the model
		// sees them, before the first word of the answer. The number of a
		// source is its rank: the first is [1], the second [2].
		for (const [index, source] of sources.entries()) {
			await emit('citation', {
				n: index + 1,
				pageId: source.pageId,
				...(source.blockId ? { blockId: source.blockId } : {}),
				title: source.title,
				snippet: source.snippet,
			});
		}

		// The sources of the whole run: the ones of the prompt first, then
		// the ones the tools found. The number of a source is its rank among
		// them, and the answer cites them the same way.
		const cited: RetrievedChunk[] = [...sources];

		// The hooks of the tools: the sources they find, what they did, and
		// the approval they asked for.
		const hooks = {
			firstSourceNumber: sources.length,
			onSources: async (found: readonly { n: number; source: RetrievedChunk }[]) => {
				for (const { n, source } of found) {
					cited.push(source);
					await emit('citation', {
						n,
						pageId: source.pageId,
						...(source.blockId ? { blockId: source.blockId } : {}),
						title: source.title,
						snippet: source.snippet,
					});
				}
			},
			onResult: async (outcome: ToolOutcome) => {
				await emit('tool.result', outcome);
			},
			onApproval: async (asked: PermissionAsked) => {
				awaitingApproval = true;
				await emit('permission.asked', asked);
			},
		};

		// The tools of the assistant: the search of a workspace, and the read
		// of a page. They read the workspace of the caller, and they carry no
		// token: a read tool has no use for one.
		//
		// The WRITE tools are here too, when the bridge is configured: they
		// ask the user for the right to write, and they write nothing. Without
		// a bridge URL they are not registered at all, and the reads keep
		// working.
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
		const tools = user
			? {
					...readToolSet({ db, user }, hooks, pool),
					...(config.bridgeUrl ? writeToolSet({ db, user }, hooks, pool, approval) : {}),
				}
			: undefined;

		const messages: ModelMessage[] = [
			...historyMessages(history),
			{ role: 'user', content: buildUserTurn(text, pages, sources) },
		];

		const outcome = await pumpUpstream({
			model: target.model,
			messages,
			controller,
			...(tools ? { tools } : {}),
			// The ceiling of the loop: the money the run holds, and the cost
			// of one more step. The loop decides before every step: a step
			// it cannot pay for becomes the answer.
			budget,
			pool,
			onToolCall: async ({ toolCallId, toolName, input }) => {
				await emit('tool.called', { toolCallId, toolName, input });
			},
			onToolError: async ({ toolCallId, toolName }) => {
				await emit('tool.result', { toolCallId, toolName, ok: false, error: 'the tool failed' });
			},
			onText: async (delta) => {
				await emit('text.delta', { text: delta });
			},
			onReasoning: async (delta) => {
				await emit('reasoning.delta', { text: delta });
			},
		});
		answer = outcome.answer;
		reasoning = outcome.reasoning;
		usage = outcome.usage;
		finishReason = outcome.finishReason;
		if (outcome.error !== undefined) throw outcome.error;
		// The run asked the user for the right to write: it ends with that
		// reason, and the approval row is what waits for the answer.
		if (awaitingApproval) finishReason = 'awaiting_approval';

		// The usage the upstream reported, or the estimate of what it did not.
		settled = usageForSettlement(runId, usage, {
			promptChars,
			outputChars: answer.length + reasoning.length,
		});
		const inputTokens = settled.inputTokens;
		const outputTokens = settled.outputTokens;
		const cost = costMicroUsd(target.pricing, settled);
		await emit('usage', { inputTokens, outputTokens, costMicroUsd: cost });

		const assistant = await appendMessage(db, {
			conversationId,
			ownerId,
			role: 'assistant',
			parts: [
				...(reasoning
					? [{ type: 'text', text: answer }, { type: 'reasoning', text: reasoning }]
					: [{ type: 'text', text: answer }]),
				// The sources of the answer, in the order they were given to the
				// model: the part of a source is its number minus one.
				...cited.map((source) => ({
					type: 'citation',
					pageId: source.pageId,
					...(source.blockId ? { blockId: source.blockId } : {}),
					title: source.title,
					snippet: source.snippet,
				})),
			],
			model: target.modelId,
			runId,
			usage: { inputTokens, outputTokens, costMicroUsd: cost },
		});

		const changed = await markRun(db, runId, 'succeeded', null, {
			inputTokens,
			outputTokens,
			costMicroUsd: cost,
		}, finishReason);
		if (changed) {
			// The settlement gives back everything the run holds: the
			// reservation up front and the extensions of the loop.
			await settleTarget(db, target, { userId: ownerId, day, reserved: outcome.reserved, actual: cost });
		}

		await emit('done', { runId, assistantMessageId: assistant?.id ?? null, finishReason });
	} catch (error) {
		const code = abortCode(controller.signal) ?? 'upstream_error';
		// A cancelled or failed run settles what the upstream reported, or
		// the estimate of what it streamed before it broke.
		const billed = settled ?? usageForSettlement(runId, usage, {
			promptChars,
			outputChars: answer.length + reasoning.length,
		});
		const cost = costMicroUsd(target.pricing, billed);
		// The row of the run is closed BEFORE the terminal frame: a client
		// that reads the row when it sees the frame reads the truth. The
		// success path does the same.
		const status: RunStatus = code === 'cancelled' ? 'cancelled' : 'failed';
		const changed = await markRun(db, runId, status, code);
		await emit('error', { code, message: failureMessage(code, error) });
		if (changed) {
			await settleTarget(db, target, { userId: ownerId, day, reserved: budget.reserved, actual: cost });
		}
	} finally {
		runStore.releaseRun(runId);
	}
}

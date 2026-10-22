import type { LanguageModelUsage, ModelMessage } from 'ai';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { costMicroUsd } from '../gateway/platform.ts';
import { settleTarget } from '../gateway/resolve.ts';
import type { ResolvedTarget } from '../gateway/resolve.ts';
import { usageForSettlement } from '../gateway/usage.ts';
import type { SettledUsage } from '../gateway/usage.ts';
import { appendMessage } from '../conversations/repo.ts';
import { markRun } from './repo.ts';
import type { RunStatus } from './repo.ts';
import * as runStore from './runStore.ts';
import { buildUserTurn, historyChars, historyMessages, memoryChars, quotedPageChars } from './prompt.ts';
import type { RunMemory } from '../memory/repo.ts';
import { systemPromptFor } from '../agents/prompt.ts';
import type { BuiltinAgent } from '../agents/builtins.ts';
import type { SkillIndex } from '../skills/runSkills.ts';
import { promptCharCount } from './estimate.ts';
import { extendRunReservation } from './extend.ts';
import type { LoopBudget } from './loopBudget.ts';
import { sourceChars } from './sources.ts';
import { createToolPool } from '../tools/index.ts';
import { buildRunTools } from './toolSet.ts';
import type { HistoryMessage, PageContext } from './prompt.ts';
import type { RetrievedChunk } from '../retrieval/search.ts';
import type { AuthUser } from '../auth.ts';
import { abortCode, failureMessage, pumpUpstream } from './streamPump.ts';
import { isDataPolicyRefusal } from '../vision/policyRefusal.ts';

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
	/** The images of this run, as bytes. They go only into this run's user message. */
	images?: readonly { data: Uint8Array; mediaType: string }[];
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
	/**
	 * The agent that shapes this run, or none.
	 *
	 * None is the general assistant: the base prompt, byte for byte. An agent
	 * adds its block to the prompt and narrows the tools to its own list.
	 */
	agent?: BuiltinAgent | null;
	/** The skills the prompt lists (the agent's built-ins and the workspace's), and their workspace. */
	skillIndex?: SkillIndex;
	/** The approved memories of the caller, quoted in the user turn (devil C39). */
	memories?: readonly RunMemory[];
	workspaceId?: string;
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
	const images = input.images ?? [];
	const memories = input.memories ?? [];
	// The agent of the run: none is the general assistant.
	const agent = input.agent ?? null;
	// The system prompt of THIS run: the base one, or the one of the agent,
	// whose data-boundary line comes last (devil C38).
	const system = systemPromptFor(agent, input.skillIndex);

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
	// The size of the prompt, for the estimate of a provider that reports
	// nothing: the reservation reads it from the same place.
	const promptChars = promptCharCount({
		text,
		historyChars: historyChars(history),
		pageChars: quotedPageChars(pages) + memoryChars(memories),
		sourceChars: sourceChars(sources),
		systemChars: system.length,
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

		// The tools of the assistant: the search of a workspace, the read of
		// a page, and — when the bridge is configured — the writes that ask
		// the user for the right to write.
		const runTools = buildRunTools({
			db,
			user,
			pool,
			runId,
			conversationId,
			ownerId,
			pages,
			sources,
			agent,
			skillIndex: input.skillIndex,
			workspaceId: input.workspaceId,
			emit: (type, data) => emit(type, data),
		});
		const tools = runTools.tools;

		const userText = buildUserTurn(text, pages, sources, memories);
		const userContent = [
			{ type: 'text' as const, text: userText },
			...images.map((image) => ({ type: 'image' as const, image: image.data, mediaType: image.mediaType })),
		];
		const messages: ModelMessage[] = [
			...historyMessages(history),
			{ role: 'user', content: userContent } as ModelMessage,
		];

		const outcome = await pumpUpstream({
			model: target.model,
			system,
			messages,
			controller,
			...(tools ? { tools } : {}),
			// Platform vision requests to OpenRouter carry the data-collection deny.
			...(target.platformBudget && images.length > 0
				? { providerOptions: { platform: { provider: { data_collection: 'deny' } } } }
				: {}),
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
		if (runTools.awaitingApproval) finishReason = 'awaiting_approval';

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
				...runTools.cited.map((source, index) => ({
					type: 'citation',
					n: index + 1,
					pageId: source.pageId,
					...(source.blockId ? { blockId: source.blockId } : {}),
					title: source.title,
					snippet: source.snippet,
				})),
				// The writes the run asked for: the card of each one. The
				// approval id is what the client needs to draw the card again
				// after a reload — the stream of the run is gone by then.
				...runTools.permissions.map((permission) => ({
					type: 'permission',
					approvalId: permission.approvalId,
					tool: permission.tool,
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
		const code = abortCode(controller.signal) ?? (isDataPolicyRefusal(error) ? 'vision_unavailable' : 'upstream_error');
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
		const runStatus: RunStatus = code === 'cancelled' ? 'cancelled' : 'failed';
		const changed = await markRun(db, runId, runStatus, code);
		await emit('error', { code, message: failureMessage(code, error) });
		if (changed) {
			await settleTarget(db, target, { userId: ownerId, day, reserved: budget.reserved, actual: cost });
		}
	} finally {
		runStore.releaseRun(runId);
	}
}

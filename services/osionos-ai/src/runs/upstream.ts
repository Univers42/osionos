import type { LanguageModelUsage, ModelMessage } from 'ai';
import { costMicroUsd } from '../gateway/platform.ts';
import { settleTarget } from '../gateway/resolve.ts';
import { usageForSettlement } from '../gateway/usage.ts';
import type { SettledUsage } from '../gateway/usage.ts';
import { appendMessage } from '../conversations/repo.ts';
import { markRun } from './repo.ts';
import type { RunStatus } from './repo.ts';
import * as runStore from './runStore.ts';
import { buildUserTurn, fileChars, historyChars, historyMessages, memoryChars, quotedPageChars } from './prompt.ts';
import { systemPromptFor } from '../agents/prompt.ts';
import { promptCharCount } from './estimate.ts';
import { attemptsUsage, providerOptionsFor, startAttempt } from './attempt.ts';
import type { Attempt, AttemptRecord } from './attempt.ts';
import { moveOn } from './moveOn.ts';
import { classifyFailure } from './failover.ts';
import type { RunEvent, UpstreamRunInput } from './upstreamInput.ts';
import { citationData, sourceChars } from './sources.ts';
import { createToolPool } from '../tools/index.ts';
import { clock, RESEARCH_LIMITS, RESEARCH_WEB_CAPS } from '../tools/limits.ts';
import { createResearchSession } from '../research/session.ts';
import type { ResearchSession } from '../research/session.ts';
import { buildRunTools } from './toolSet.ts';
import { mcpToolChars } from '../mcpClient/runTools.ts';
import { config } from '../config.ts';
import { readWebTaint } from '../web/settings.ts';
import { newWebRun, webToolChars } from '../web/runWeb.ts';
import { abortCode, failureMessage, pumpUpstream } from './streamPump.ts';
import { isDataPolicyRefusal } from '../vision/policyRefusal.ts';
import { scheduleSummary } from '../summary/summarize.ts';
import { THREAD_SYSTEM_PROMPT, ThreadAccessLost } from '../threads/context.ts';
import { setRunAnswer } from './repo.ts';

/**
 * The upstream of a run: the model call, the events, the settlement.
 *
 * Every event goes through the stream first, so a client that reconnects sees
 * exactly what the first client saw, and then to the live response.
 *
 * A run is a chain of attempts (src/runs/attempt.ts): when a model fails
 * before it said anything, the run moves to the next one, in ONE transaction
 * (src/runs/rotate.ts).
 */

export type { RunEvent, UpstreamRunInput };


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
		abstained = false,
		user,
		skippedPageIds,
		userMessageId,
		title,
	} = input;
	const images = input.images ?? [];
	const files = input.files ?? [];
	const memories = input.memories ?? [];
	// The agent of the run: none is the general assistant.
	const agent = input.agent ?? null;
	// The system prompt of THIS run: the base one, or the one of the agent,
	// whose data-boundary line comes last (devil C38).
	const system = input.thread ? THREAD_SYSTEM_PROMPT : systemPromptFor(agent, input.skillIndex);

	// The cancel controller is the run's; each attempt follows it.
	const runController = new AbortController();
	runStore.trackRun(runId, runController);

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
	const accountBlockText = input.accountBlock;
	const viewBlockText = input.viewBlock;
	const workspaceBlockText = input.workspaceBlock;
	const contextChars =
		(accountBlockText?.length ?? 0) +
		(viewBlockText?.length ?? 0) +
		(workspaceBlockText?.length ?? 0) +
		mcpToolChars(input.mcpTools ?? []) +
		webToolChars(input.web === true) +
		(input.summaryBlock?.length ?? 0) +
		(input.userContext?.block?.length ?? 0);
	const promptChars = promptCharCount({
		text: input.thread?.prompt ?? text,
		historyChars: historyChars(history),
		pageChars: quotedPageChars(pages) + memoryChars(memories) + fileChars(files),
		sourceChars: sourceChars(sources),
		systemChars: system.length,
		contextChars,
	});
	// The budget of the loop: the money the run holds, and the ceiling of a
	// step. The loop asks the ledger for what it needs, one extension at a
	// time, and the extension is atomic: two runs never share it.
	const steps = [{ target, amount: reserved }, ...(input.fallbacks ?? [])];
	const records: AttemptRecord[] = [];
	const limits = input.research ? RESEARCH_LIMITS : undefined;
	const startedAt = clock.now();
	const runState = {
		signal: runController.signal,
		runId,
		userId: ownerId,
		day,
		promptChars,
		...(limits ? { limits, startedAt } : {}),
	};
	let index = 0;
	let current = startAttempt(db, runState, steps[0]);
	// The error of the current attempt: a later failure of OUR code must not hide it.
	let failure: unknown;
	// The pool of the tools of THIS run: the tools of a run may not put
	// more in its context than the reservation of the run counted, and one
	// step may not add more than a step's share of it.
	const pool = limits ? createToolPool(limits.poolChars, limits.stepChars) : createToolPool();
	let research: ResearchSession | undefined;

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
		// A resting primary was skipped before any call: the reader still learns
		// which model answers, as after a failed attempt (C260's closed reasons).
		if (input.restedFrom) {
			await emit('route', { from: input.restedFrom, to: target.modelId, reason: 'unavailable' });
		}
		// The window left earlier turns out: the reader learns it, and whether a
		// summary of them is in the prompt (context C380). Flag off: never.
		if (input.truncated) {
			await emit('context.truncated', { summarized: input.truncated.summarized });
		}

		// The sources of the answer: one frame each, in the order the model
		// sees them, before the first word of the answer. The number of a
		// source is its rank: the first is [1], the second [2].
		for (const [index, source] of sources.entries()) {
			await emit('citation', citationData(source, index + 1));
		}

		// The tools of the assistant: the search of a workspace, the read of
		// a page, and — when the bridge is configured — the writes that ask
		// the user for the right to write.
		// The taint is read only while the flag is on: a database without the
		// web columns is never asked for them (C375).
		const webTaint = config.webEnabled ? await readWebTaint(db, conversationId) : undefined;
		const web =
			input.web === true && webTaint
				? newWebRun({
						db,
						redis,
						runId,
						userId: ownerId,
						conversationId,
						taint: webTaint,
						typed: text,
						...(limits ? { caps: RESEARCH_WEB_CAPS } : {}),
						read: [
							...pages.map((page) => page.text),
							...sources.map((source) => source.snippet),
							...files.map((file) => file.text),
							...memories.map((memory) => memory.body),
							...(input.userContext?.block ? [input.userContext.block] : []),
						],
					})
				: undefined;
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
			...(input.userContext && input.userContext.skills.length > 0 ? { userSkills: input.userContext.skills } : {}),
			...(input.mcpTools && input.mcpTools.length > 0 ? { mcp: { tools: input.mcpTools, redis } } : {}),
			...(web ? { web } : {}),
			...(webTaint ? { webTaint } : {}),
			...(input.research ? { research: true } : {}),
			emit: (type, data) => emit(type, data),
		});
		const tools = runTools.tools;

		const userText = input.thread ? input.thread.prompt : buildUserTurn(text, pages, sources, memories, abstained, {
			files,
			...(accountBlockText ? { account: accountBlockText } : {}),
			...(viewBlockText ? { view: viewBlockText } : {}),
			...(workspaceBlockText ? { workspace: workspaceBlockText } : {}),
			...(input.summaryBlock ? { summary: input.summaryBlock } : {}),
			...(input.userContext?.block ? { userContext: input.userContext.block } : {}),
		});
		const userContent = [
			{ type: 'text' as const, text: userText },
			...images.map((image) => ({ type: 'image' as const, image: image.data, mediaType: image.mediaType })),
		];
		const messages: ModelMessage[] = [
			...historyMessages(history),
			{ role: 'user', content: userContent } as ModelMessage,
		];

		if (limits) {
			research = createResearchSession({ emit, counters: () => web?.counters, maxSteps: limits.maxSteps, startedAt });
		}
		const callModel = async (attempt: Attempt) => {
			const providerOptions = providerOptionsFor(attempt.target, images.length, input.effort);
			const pumped = await pumpUpstream({
				model: attempt.target.model,
				system,
				messages,
				controller: attempt.controller,
				// In a chain no attempt retries: the chain is the retry, and 3 models
				// must be 3 requests, not 9 (devil C250).
				...(steps.length > 1 ? { maxRetries: 0 } : {}),
				...(tools ? { tools } : {}),
				...(providerOptions ? { providerOptions } : {}),
				// The ceiling of the loop: the money the run holds, and the cost
				// of one more step. The loop decides before every step: a step
				// it cannot pay for becomes the answer.
				budget: attempt.budget,
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
				...(research ? research.hooks : {}),
			});
			// Held-back text goes out before the run ends, or fails over.
			await research?.flush();
			return pumped;
		};
		let outcome = await callModel(current);
		while (outcome.error !== undefined) {
			failure = outcome.error;
			const move = await moveOn({ db, redis, run: runState, steps, index, current, outcome, records, emit });
			if (move.kind === 'stay') break;
			if (move.kind === 'refused') {
				// The old money is back and the row holds none: only the end is left.
				research?.end('budget_exhausted', false);
				await markRun(db, runId, 'failed', 'budget_exhausted', attemptsUsage(records));
				await emit('error', { code: 'budget_exhausted', message: failureMessage('budget_exhausted', failure) });
				return;
			}
			index += 1;
			current = move.attempt;
			outcome = await callModel(current);
		}
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
		const cost = costMicroUsd(current.target.pricing, settled);
		await emit('usage', { inputTokens, outputTokens, costMicroUsd: cost });
		// The asker left the channel, or the trigger went, while the model wrote:
		// the draft is dropped before it is stored (C454).
		if (input.thread && !(await input.thread.stillAllowed())) throw new ThreadAccessLost();

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
					...citationData(source, index + 1),
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
			model: current.target.modelId,
			runId,
			usage: { inputTokens, outputTokens, costMicroUsd: cost },
		});
		// The one message the bridge may post (C432), named before the run reads
		// 'succeeded': a run the bridge sees succeeded always has its answer.
		if (input.thread && assistant) await setRunAnswer(db, runId, assistant.id);

		const changed = await markRun(db, runId, 'succeeded', null, {
			inputTokens,
			outputTokens,
			costMicroUsd: cost,
			...attemptsUsage(records, { target: current.target, outcome: 'succeeded', billed: cost }),
		}, finishReason);
		if (changed) {
			// The settlement gives back everything the run holds: the
			// reservation up front and the extensions of the loop.
			await settleTarget(db, current.target, { userId: ownerId, day, reserved: outcome.reserved, actual: cost });
		}

		research?.end('done', current.budget.deadlineHit === true);
		await emit('done', { runId, assistantMessageId: assistant?.id ?? null, finishReason });
		// The summary is written after `done`, off the run's response, by the
		// target that answered (context C377, C381).
		if (input.summarizeFrom) {
			scheduleSummary({ db, target: current.target, runId, conversationId, ownerId, oldestKeptId: input.summarizeFrom.oldestKeptId, day });
		}
	} catch (error) {
		const code = error instanceof ThreadAccessLost
			? 'access_revoked'
			: abortCode(current.controller.signal) ?? (isDataPolicyRefusal(error) ? 'vision_unavailable' : 'upstream_error');
		// A cancelled or failed run settles what the upstream reported, or
		// the estimate of what it streamed before it broke.
		const billed = settled ?? usageForSettlement(runId, usage, {
			promptChars,
			outputChars: answer.length + reasoning.length,
		});
		// With a chain, a 429 or a 5xx that reported nothing cost nothing
		// (devil C245); a run without one keeps the estimate it always had.
		const chainFailure = steps.length > 1 && !usage && !answer && !reasoning
			? classifyFailure(failure ?? error)
			: null;
		const cost = chainFailure?.billing === 'none' ? 0 : costMicroUsd(current.target.pricing, billed);
		// The row of the run is closed BEFORE the terminal frame: a client
		// that reads the row when it sees the frame reads the truth. The
		// success path does the same.
		research?.end(code, current.budget.deadlineHit === true);
		const runStatus: RunStatus = code === 'cancelled' || code === 'access_revoked' ? 'cancelled' : 'failed';
		const changed = await markRun(db, runId, runStatus, code, attemptsUsage(records, { target: current.target, outcome: code, billed: cost }));
		await emit('error', { code, message: failureMessage(code, error) });
		if (changed) {
			await settleTarget(db, current.target, { userId: ownerId, day, reserved: current.budget.reserved, actual: cost });
		}
	} finally {
		research?.log();
		runStore.releaseRun(runId);
	}
}

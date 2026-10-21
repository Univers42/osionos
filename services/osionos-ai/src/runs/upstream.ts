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
import { buildUserTurn, historyChars, historyMessages, promptCharCount, quotedPageChars } from './prompt.ts';
import type { HistoryMessage, PageContext } from './prompt.ts';
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
	// The size of the prompt, for the estimate of a provider that reports
	// nothing: the reservation reads it from the same place.
	const promptChars = promptCharCount({
		text,
		historyChars: historyChars(history),
		pageChars: quotedPageChars(pages),
	});

	try {
		await emit('run.started', {
			runId,
			conversationId,
			model: target.modelId,
			userMessageId,
			skippedPageIds: [...skippedPageIds],
			conversationTitle: title,
		});

		const messages: ModelMessage[] = [
			...historyMessages(history),
			{ role: 'user', content: buildUserTurn(text, pages) },
		];

		const outcome = await pumpUpstream({
			model: target.model,
			messages,
			controller,
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
			parts: reasoning
				? [{ type: 'text', text: answer }, { type: 'reasoning', text: reasoning }]
				: [{ type: 'text', text: answer }],
			model: target.modelId,
			runId,
			usage: { inputTokens, outputTokens, costMicroUsd: cost },
		});

		const changed = await markRun(db, runId, 'succeeded', null, {
			inputTokens,
			outputTokens,
			costMicroUsd: cost,
		});
		if (changed) {
			await settleTarget(db, target, { userId: ownerId, day, reserved, actual: cost });
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
		await emit('error', { code, message: failureMessage(code, error) });
		const status: RunStatus = code === 'cancelled' ? 'cancelled' : 'failed';
		const changed = await markRun(db, runId, status, code);
		if (changed) {
			await settleTarget(db, target, { userId: ownerId, day, reserved, actual: cost });
		}
	} finally {
		runStore.releaseRun(runId);
	}
}

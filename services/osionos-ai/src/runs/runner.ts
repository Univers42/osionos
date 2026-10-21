import type { LanguageModelUsage, ModelMessage } from 'ai';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { config } from '../config.ts';
import { costMicroUsd } from '../gateway/platform.ts';
import type { PlatformModelEntry } from '../gateway/platform.ts';
import { reserve, settle } from '../budget.ts';
import { checkRunRateLimit } from '../rateLimit.ts';
import { appendMessage, touchConversation } from '../conversations/repo.ts';
import { getRun, insertRun, markRun, sweepStaleRows } from './repo.ts';
import type { RunRow, RunStatus } from './repo.ts';
import * as runStore from './runStore.ts';
import { SYSTEM_PROMPT, historyChars, loadHistory } from './prompt.ts';
import type { HistoryMessage } from './prompt.ts';
import { abortCode, pumpUpstream } from './streamPump.ts';

/**
 * The runner of a run: the row, the money, the model call, the events.
 *
 * The order is the one that matters for the money: the budget is reserved
 * BEFORE the upstream is called, and settled after it. A run that never reaches
 * the upstream costs nothing.
 */

/** A run that runs longer than this is stale: the sweep gives it up. */
export const STALE_RUN_MS = 10 * 60_000;

/** One event of a run, as the client sees it. */
export interface RunEvent {
	id: string;
	type: string;
	data: unknown;
}

export interface StartRunInput {
	db: Pool;
	redis: Redis;
	runId: string;
	conversationId: string;
	ownerId: string;
	text: string;
	model: PlatformModelEntry;
	emit: (event: RunEvent) => void;
}

export type StartRunOutcome =
	| { kind: 'started'; run: RunRow; execute: () => Promise<void> }
	| { kind: 'reattach'; run: RunRow }
	| { kind: 'refused'; status: number; code: string };

/** The day of the ledger: UTC, so every replica books on the same day. */
export function today(now: Date = new Date()): string {
	return now.toISOString().slice(0, 10);
}

/** The refusal codes that a re-POST of the same run must answer again. */
const PREFLIGHT_ERRORS: Record<string, number> = {
	rate_limited: 429,
	budget_exhausted: 402,
};

/**
 * The start of a run.
 *
 * The row comes first: the client generates the id, so the primary key is the
 * idempotency key. A row that is already there is the same run, and the route
 * re-attaches to its stream instead of calling the model a second time.
 */
export async function startRun(input: StartRunInput): Promise<StartRunOutcome> {
	const { db, redis, runId, conversationId, ownerId, text, model } = input;

	const inserted = await insertRun(db, { runId, conversationId, ownerId, model: model.id });
	if (inserted.kind === 'conflict') {
		// The conversation already has a running run: the partial unique index
		// (ai_runs_one_running_per_conversation) says so, with no race.
		return { kind: 'refused', status: 409, code: 'run_in_progress' };
	}
	if (inserted.kind === 'missing') {
		return { kind: 'refused', status: 404, code: 'not_found' };
	}
	if (inserted.kind === 'exists') {
		const existing = await getRun(db, runId);
		if (!existing || existing.owner_id !== ownerId) {
			return { kind: 'refused', status: 404, code: 'not_found' };
		}
		const refused = existing.error ? PREFLIGHT_ERRORS[existing.error] : undefined;
		if (existing.status !== 'running' && refused) {
			return { kind: 'refused', status: refused, code: existing.error as string };
		}
		return { kind: 'reattach', run: existing };
	}

	// The history is read before the money moves: the reservation estimates the
	// size of the prompt, so it has to know the prompt.
	const history = await loadHistory(db, { conversationId, ownerId });

	// (b) The rate limit and the budget, before any upstream call.
	const rate = await checkRunRateLimit(redis, ownerId, config.runsPerMinute);
	if (!rate.allowed) {
		await markRun(db, runId, 'failed', 'rate_limited');
		return { kind: 'refused', status: 429, code: 'rate_limited' };
	}
	const day = today();
	const amount = estimateMicroUsd(model, { text, historyChars: historyChars(history) });
	const reserved = await reserve(db, {
		userId: ownerId,
		day,
		amount,
		userLimit: config.userDailyMicroUsd,
		platformLimit: config.platformDailyMicroUsd,
	});
	if (!reserved) {
		await markRun(db, runId, 'failed', 'budget_exhausted');
		return { kind: 'refused', status: 402, code: 'budget_exhausted' };
	}
	await db.query('update public.ai_runs set reserved_microusd = $2::bigint where id = $1', [runId, amount]);

	// (c) The user's message joins the transcript.
	const userMessage = await appendMessage(db, {
		conversationId,
		ownerId,
		role: 'user',
		parts: [{ type: 'text', text }],
		runId,
	});
	if (!userMessage) {
		await settle(db, { userId: ownerId, day, reserved: amount, actual: 0 });
		await markRun(db, runId, 'failed', 'not_found');
		return { kind: 'refused', status: 404, code: 'not_found' };
	}
	await touchConversation(db, conversationId);

	const execute = async (): Promise<void> => {
		await runUpstream({ ...input, day, reserved: amount, history, userMessageId: userMessage.id });
	};
	return { kind: 'started', run: (await getRun(db, runId)) as RunRow, execute };
}

/**
 * The reservation of a run: what the prompt is expected to cost.
 *
 * Caveat: the input tokens are estimated at four characters per token, which
 * under-counts CJK and code-heavy text. The estimate is a ceiling for the
 * reservation, not a bill: the settlement corrects it with the usage the
 * upstream reports.
 */
export function estimateMicroUsd(
	model: PlatformModelEntry,
	{ text, historyChars }: { text: string; historyChars: number },
): number {
	const chars = text.length + historyChars + SYSTEM_PROMPT.length;
	const estimatedInputTokens = Math.ceil(chars / 4);
	return costMicroUsd(model, { inputTokens: estimatedInputTokens, outputTokens: config.maxOutputTokens });
}

/**
 * The run itself: the model call, the events, the settlement.
 *
 * Every event goes through the stream first, so a client that reconnects sees
 * exactly what the first client saw, and then to the live response.
 */
async function runUpstream(
	input: StartRunInput & { day: string; reserved: number; history: HistoryMessage[]; userMessageId: string },
): Promise<void> {
	const { db, redis, runId, conversationId, ownerId, text, model, day, reserved, history, userMessageId } = input;

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
	let finishReason = 'stop';

	try {
		await emit('run.started', {
			runId,
			conversationId,
			model: model.id,
			userMessageId,
			skippedPageIds: [],
		});

		const messages: ModelMessage[] = [
			...history
				.filter((message) => message.role === 'user' || message.role === 'assistant')
				.map((message) => ({ role: message.role as 'user' | 'assistant', content: message.text })),
			{ role: 'user', content: text },
		];

		const outcome = await pumpUpstream({
			model,
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

		const inputTokens = usage?.inputTokens ?? 0;
		const outputTokens = usage?.outputTokens ?? 0;
		const cost = costMicroUsd(model, { inputTokens, outputTokens });
		await emit('usage', { inputTokens, outputTokens, costMicroUsd: cost });

		const assistant = await appendMessage(db, {
			conversationId,
			ownerId,
			role: 'assistant',
			parts: reasoning
				? [{ type: 'text', text: answer }, { type: 'reasoning', text: reasoning }]
				: [{ type: 'text', text: answer }],
			model: model.id,
			runId,
			usage: { inputTokens, outputTokens, costMicroUsd: cost },
		});

		const changed = await markRun(db, runId, 'succeeded', null, {
			inputTokens,
			outputTokens,
			costMicroUsd: cost,
		});
		if (changed) await settle(db, { userId: ownerId, day, reserved, actual: cost });

		await emit('done', { runId, assistantMessageId: assistant?.id ?? null, finishReason });
	} catch (error) {
		const code = abortCode(controller.signal) ?? 'upstream_error';
		const cost = costMicroUsd(model, {
			inputTokens: usage?.inputTokens ?? 0,
			outputTokens: usage?.outputTokens ?? 0,
		});
		await emit('error', { code, message: failureMessage(code, error) });
		const status: RunStatus = code === 'cancelled' ? 'cancelled' : 'failed';
		const changed = await markRun(db, runId, status, code);
		if (changed) await settle(db, { userId: ownerId, day, reserved, actual: cost });
	} finally {
		runStore.releaseRun(runId);
	}
}

/** The short message of a failure: never the body of the upstream. */
function failureMessage(code: string, error: unknown): string {
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
 * The sweep of the stale runs: a run that says 'running' for ten minutes is
 * not running any more. It is failed, and the reservation it holds is given
 * back.
 */
export async function sweepStaleRuns(db: Pool, staleMs: number = STALE_RUN_MS): Promise<string[]> {
	return sweepStaleRows(db, staleMs, today());
}

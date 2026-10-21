import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { config } from '../config.ts';
import { reserveTarget, settleTarget } from '../gateway/resolve.ts';
import type { ResolvedTarget } from '../gateway/resolve.ts';
import { checkRunRateLimit } from '../rateLimit.ts';
import { appendUserTurn, touchConversation } from '../conversations/repo.ts';
import { getRun, insertRun, markRun, sweepStaleRows } from './repo.ts';
import type { RunRow } from './repo.ts';
import { runUpstream } from './upstream.ts';
import type { RunEvent } from './upstream.ts';
import {
	historyChars,
	loadHistory,
	loadPageContext,
	quotedPageChars,
} from './prompt.ts';
import { estimateLoopMicroUsd } from './estimate.ts';
import { sourceChars } from './sources.ts';
import { retrieve } from '../retrieval/search.ts';
import type { RetrievedChunk } from '../retrieval/search.ts';
import type { AuthUser } from '../auth.ts';

export type { RunEvent };

/**
 * The runner of a run: the row, the money, the model call, the events.
 *
 * The order is the one that matters for the money: the budget is reserved
 * BEFORE the upstream is called, and settled after it. A run that never reaches
 * the upstream costs nothing.
 *
 * The runner knows nothing about connections: it is given a target, and the
 * target says whether the platform pays for the call.
 */

/** A run that runs longer than this is stale: the sweep gives it up. */
export const STALE_RUN_MS = 10 * 60_000;

export interface StartRunInput {
	db: Pool;
	redis: Redis;
	runId: string;
	conversationId: string;
	ownerId: string;
	/** The pages the client quotes: at most three, and only the ones it may read. */
	pageIds?: readonly string[];
	/** The workspaces of the caller: the gate of the pages. */
	memberWorkspaceIds?: readonly string[];
	/**
	 * The caller, with the workspaces of their token.
	 *
	 * The retrieval needs them: a search is done in the caller's workspaces,
	 * and only the token says which ones are theirs.
	 */
	user?: AuthUser;
	/**
	 * The caller's whole workspace is searched.
	 *
	 * The run then quotes the pages that answer the question, and the client
	 * gets them as `citation` events.
	 */
	searchWorkspace?: boolean;
	text: string;
	/** Where the model is called, and who pays for it. */
	target: ResolvedTarget;
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
 * The sources of a run: the chunks of the caller's workspaces that answer the
 * question.
 *
 * A run without a search has no sources, and a search that fails has none
 * either: the embedding service may be down, and an answer without sources
 * is better than no answer. The failure is logged once, and the run goes on.
 */
async function findSources(
	db: Pool,
	input: StartRunInput,
	text: string,
): Promise<RetrievedChunk[]> {
	if (input.searchWorkspace !== true || !input.user) return [];
	try {
		return await retrieve(db, input.user, { query: text });
	} catch (error) {
		const code = error instanceof Error ? error.message : 'retrieval_failed';
		console.warn(JSON.stringify({ event: 'retrieval_failed', code }));
		return [];
	}
}

/**
 * The start of a run.
 *
 * The row comes first: the client generates the id, so the primary key is the
 * idempotency key. A row that is already there is the same run, and the route
 * re-attaches to its stream instead of calling the model a second time.
 */
export async function startRun(input: StartRunInput): Promise<StartRunOutcome> {
	const { db, redis, runId, conversationId, ownerId, text, target } = input;

	const inserted = await insertRun(db, { runId, conversationId, ownerId, model: target.modelId });
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
	// The pages are read before the money moves: the reservation estimates the
	// size of the prompt, and the pages are part of it. A page the caller may
	// not read is skipped, never refused.
	const context = await loadPageContext(db, {
		userId: ownerId,
		memberWorkspaceIds: input.memberWorkspaceIds ?? [],
		pageIds: input.pageIds ?? [],
	});
	// The sources of the run: the pages of the caller's workspaces that answer
	// the question. They are read before the money moves too: they are part of
	// the prompt. A retrieval that fails is not a failure of the run: the run
	// goes on without sources, and the failure is logged once.
	const sources = await findSources(db, input, text);
	const day = today();
	// The reservation is the ceiling of the whole loop: the model may call a
	// tool, and the answer comes after the tool.
	const amount = estimateLoopMicroUsd(target.pricing, {
		text,
		historyChars: historyChars(history),
		pageChars: quotedPageChars(context.pages),
		sourceChars: sourceChars(sources),
	});
	// A run on a connection of the user is not ours to pay for: the provider
	// bills the user, and our ledger stays out of it.
	const reserved = await reserveTarget(db, target, { userId: ownerId, day, amount });
	if (!reserved) {
		await markRun(db, runId, 'failed', 'budget_exhausted');
		return { kind: 'refused', status: 402, code: 'budget_exhausted' };
	}
	await db.query('update public.ai_runs set reserved_microusd = $2::bigint where id = $1', [runId, amount]);

	// (c) The user's message joins the transcript, and the conversation takes
	// its title when it has none: one transaction, one question.
	const { message: userMessage, title } = await appendUserTurn(db, {
		conversationId,
		ownerId,
		parts: [{ type: 'text', text }],
		runId,
		text,
	});
	if (!userMessage) {
		await settleTarget(db, target, { userId: ownerId, day, reserved: amount, actual: 0 });
		await markRun(db, runId, 'failed', 'not_found');
		return { kind: 'refused', status: 404, code: 'not_found' };
	}
	await touchConversation(db, conversationId);

	const execute = async (): Promise<void> => {
		await runUpstream({
			db,
			redis,
			runId,
			conversationId,
			ownerId,
			text,
			target,
			emit: input.emit,
			day,
			reserved: amount,
			history,
			pages: context.pages,
			sources,
			user: input.user,
			skippedPageIds: context.skippedPageIds,
			userMessageId: userMessage.id,
			title,
		});
	};
	return { kind: 'started', run: (await getRun(db, runId)) as RunRow, execute };
}

/**
 * The sweep of the stale runs: a run that says 'running' for ten minutes is
 * not running any more. It is failed, and the reservation it holds is given
 * back.
 */
export async function sweepStaleRuns(db: Pool, staleMs: number = STALE_RUN_MS): Promise<string[]> {
	return sweepStaleRows(db, staleMs, today());
}

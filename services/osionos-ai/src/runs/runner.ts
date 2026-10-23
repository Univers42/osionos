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
import { systemPromptFor } from '../agents/prompt.ts';
import type { BuiltinAgent } from '../agents/builtins.ts';
import { buildSkillIndex, workspaceSkillsForRun } from '../skills/runSkills.ts';
import { estimateRunMicroUsd } from './estimate.ts';
import { sourceChars } from './sources.ts';
import { abstainThreshold, retrieve, shouldAbstain } from '../retrieval/search.ts';
import type { RetrievedChunk } from '../retrieval/search.ts';
import type { AuthUser } from '../auth.ts';
import { fetchAttachment } from '../vision/fetchAttachment.ts';
import { readImageHeader } from '../vision/imageHeader.ts';
import { stripMetadata } from '../vision/stripMetadata.ts';

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

export interface AttachmentRef {
	kind: 'chat';
	id: string;
}
export interface MediaAttachmentRef {
	kind: 'media';
	path: string;
}
export type RunAttachment = AttachmentRef | MediaAttachmentRef;

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
	/** The attachments the user attached to this run. */
	attachments?: readonly RunAttachment[];
	/** The caller's token of THIS run request: read, used, never stored. */
	sessionToken?: string;
	/**
	 * The agent that shapes this run, or none.
	 *
	 * None is the general assistant: its prompt is the one of today, byte for
	 * byte. An agent adds its instructions to the prompt and narrows the tools
	 * to its own list — it never gains one.
	 */
	agent?: BuiltinAgent | null;
	/** The workspace of the conversation: its skills join the prompt, when the caller is a live member. */
	workspaceId?: string;
	/** Where the model is called, and who pays for it. */
	target: ResolvedTarget;
	emit: (event: RunEvent) => void;
}

export type StartRunOutcome =
	| { kind: 'started'; run: RunRow; execute: () => Promise<void> }
	| { kind: 'reattach'; run: RunRow }
	| { kind: 'refused'; status: number; code: string; retryAfterSeconds?: number };

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
 *
 * When the reranker scored the chunks and even the best is under the
 * abstention threshold, the run quotes none and tells the model the question
 * was not found in the workspace (`abstained`).
 */
async function findSources(
	db: Pool,
	input: StartRunInput,
	text: string,
): Promise<{ sources: RetrievedChunk[]; abstained: boolean }> {
	if (input.searchWorkspace !== true || !input.user) return { sources: [], abstained: false };
	try {
		const chunks = await retrieve(db, input.user, { query: text });
		if (shouldAbstain(chunks, abstainThreshold())) return { sources: [], abstained: true };
		return { sources: chunks, abstained: false };
	} catch (error) {
		const code = error instanceof Error ? error.message : 'retrieval_failed';
		console.warn(JSON.stringify({ event: 'retrieval_failed', code }));
		return { sources: [], abstained: false };
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
	const attachments = input.attachments ?? [];
	const sessionToken = input.sessionToken ?? '';
	// The agent of the run: none is the general assistant. Its id and its
	// version are pinned on the row (devil C40).
	const agent = input.agent ?? null;

	const inserted = await insertRun(db, {
		runId,
		conversationId,
		ownerId,
		model: target.modelId,
		agentId: agent?.id ?? null,
		agentVersion: agent?.version ?? null,
	});
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

	// A run that carries attachments on a model without vision is refused
	// before anything else: no upstream call, no money.
	if (attachments.length > 0 && !target.vision) {
		await markRun(db, runId, 'failed', 'model_no_vision');
		return { kind: 'refused', status: 400, code: 'model_no_vision' };
	}

	// The rate limit comes before the attachments: a refused run makes the
	// service fetch nothing.
	const rate = await checkRunRateLimit(redis, ownerId, config.runsPerMinute);
	if (!rate.allowed) {
		await markRun(db, runId, 'failed', 'rate_limited');
		// The client counts the seconds down before it offers the retry.
		return { kind: 'refused', status: 429, code: 'rate_limited', retryAfterSeconds: rate.retryAfterSeconds };
	}
	// The attachments are fetched through the bridge with the caller's token of
	// THIS request. They are validated and stripped before the money moves.
	const images: { data: Uint8Array; mediaType: string }[] = [];
	try {
		for (const attachment of attachments) {
			const bridgePath =
				attachment.kind === 'chat' ? `/api/chat/uploads/${attachment.id}` : attachment.path;
			const fetched = await fetchAttachment(bridgePath, sessionToken);
			const header = readImageHeader(fetched.bytes);
			if (header.width * header.height > 16_700_000) {
				throw Object.assign(new Error('image_too_large'), { status: 422, code: 'image_too_large' });
			}
			const stripped = stripMetadata(fetched.bytes);
			// The type of the image is the one its BYTES say: the bridge
			// announces the type it stored, and a file that was stored with
			// the wrong type must not decide what the model sees.
			images.push({ data: stripped, mediaType: `image/${header.format}` });
		}
	} catch (error) {
		const candidate = error as { status?: unknown; code?: unknown };
		const status = typeof candidate?.status === 'number' ? candidate.status : 422;
		const code = typeof candidate?.code === 'string' ? candidate.code : 'invalid_image';
		// Bridge 403/404 already became attachment_not_found.
		const finalCode = code === 'attachment_not_found' ? 'attachment_not_found' : code;
		const finalStatus = code === 'attachment_not_found' ? 404 : status >= 400 ? status : 422;
		await markRun(db, runId, 'failed', finalCode);
		return { kind: 'refused', status: finalStatus, code: finalCode };
	}

	// The history is read before the money moves: the reservation estimates the
	// size of the prompt, so it has to know the prompt.
	const history = await loadHistory(db, { conversationId, ownerId });

	// (b) The budget, before any upstream call.
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
	const { sources, abstained } = await findSources(db, input, text);
	// The skills index of THIS run: the agent's built-ins and the workspace's
	// skills, built once so the reservation counts the prompt the call sends.
	const skillIndex = buildSkillIndex(
		agent?.skills ?? [],
		await workspaceSkillsForRun(db, input.user, input.workspaceId),
	);
	const day = today();
	// The reservation is TWO step ceilings: the first step of the loop, and
	// the answer that must follow it. The steps after that ask the ledger
	// for what they need, one at a time (src/runs/loopBudget.ts).
	const baseAmount = estimateRunMicroUsd(target.pricing, {
		text,
		historyChars: historyChars(history),
		pageChars: quotedPageChars(context.pages),
		sourceChars: sourceChars(sources),
		// The system prompt of THIS run: the base one, or the longer one of
		// the agent. The reservation counts what the call really sends.
		systemChars: systemPromptFor(agent, skillIndex).length,
	});
	const imageMicroUsd = Math.ceil(
		(images.length * config.visionTokensPerImage * target.pricing.inputMicroUsdPerMTok) / 1e6,
	);
	const amount = baseAmount + imageMicroUsd;
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
	const userParts: unknown[] = [{ type: 'text', text: [text, ...images.map(() => '[image]')].join('\n') }];
	for (const attachment of attachments) {
		userParts.push({ type: 'attachment', ...attachment });
	}
	const { message: userMessage, title } = await appendUserTurn(db, {
		conversationId,
		ownerId,
		parts: userParts,
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
			abstained,
			user: input.user,
			skippedPageIds: context.skippedPageIds,
			userMessageId: userMessage.id,
			title,
			images,
			agent,
			skillIndex,
			workspaceId: input.workspaceId,
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

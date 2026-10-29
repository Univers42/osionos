import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { config } from '../config.ts';
import { reserveTarget, settleTarget } from '../gateway/resolve.ts';
import type { ResolvedTarget } from '../gateway/resolve.ts';
import { checkRunRateLimit } from '../rateLimit.ts';
import { appendUserTurn, deleteMessagesFromRun, hasMessagesOfRun, touchConversation } from '../conversations/repo.ts';
import { getRun, insertRun, markRun, sweepStaleRows } from './repo.ts';
import type { RunRow } from './repo.ts';
import { runUpstream } from './upstream.ts';
import { loadMcpTools, mcpToolChars } from '../mcpClient/runTools.ts';
import { webOnForRun, webToolChars } from '../web/runWeb.ts';
import { RESEARCH_LIMITS } from '../tools/limits.ts';
import { readRunSummary } from '../summary/repo.ts';
import type { Effort } from './effort.ts';
import type { RunEvent } from './upstream.ts';
import {
	accountBlock,
	conversationSummaryBlock,
	fileChars,
	historyChars,
	loadHistoryWindow,
	loadPageContext,
	memoryChars,
	quotedPageChars,
	viewBlock,
	workspaceBlock,
} from './prompt.ts';
import { loadAccountContext } from './account.ts';
import { loadWorkspaceOverview } from './workspace.ts';
import { systemPromptFor } from '../agents/prompt.ts';
import type { AgentConfig } from '../agents/config.ts';
import { isCustomAgent } from '../agents/config.ts';
import { PREFIX_MAX, prefixCost } from '../agents/prefix.ts';
import { buildSkillIndex, workspaceSkillsForRun } from '../skills/runSkills.ts';
import { memoriesForRun } from '../memory/runMemories.ts';
import { recordMemoryPins } from '../memory/repo.ts';
import { chainSteps, reservationOf } from './chain.ts';
import { orderByRest } from './cooldown.ts';
import { sourceChars } from './sources.ts';
import { abstainThreshold, retrieve, shouldAbstain } from '../retrieval/search.ts';
import type { RetrievedChunk } from '../retrieval/search.ts';
import type { AuthUser } from '../auth.ts';
import { loadAttachments } from './attachments.ts';
import { fitFiles } from '../files/excerpt.ts';
import type { FittedFile } from '../files/excerpt.ts';
import { THREAD_SYSTEM_PROMPT } from '../threads/context.ts';
import type { ThreadRun } from './upstreamInput.ts';
import { userContextForRun } from '../context/runContext.ts';

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
	/** Display data of a file: the bytes decide its type, never the name. */
	name?: string;
}
export type RunAttachment = AttachmentRef | MediaAttachmentRef;

export interface StartRunInput {
	db: Pool;
	redis: Redis;
	runId: string;
	conversationId: string;
	ownerId: string;
	/** Edit and resend: drop the conversation's messages from the first one of this run onward. */
	replaceFromRunId?: string;
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
	agent?: AgentConfig | null;
	/** The workspace of the conversation: its skills join the prompt, when the caller is a live member. */
	workspaceId?: string;
	/** Whether the account block is included in the prompt. */
	account?: boolean;
	/** The web toggle of THIS message (C355): one of three layers, never sticky. */
	web?: boolean;
	/** Research mode (C396): the route admitted it; needs `web`. */
	research?: boolean;
	/** The view the caller has open, as the client reports it. */
	view?: import('./prompt.ts').RunView;
	/** Where the model is called, and who pays for it. */
	target: ResolvedTarget;
	/** How hard a reasoning model thinks; ignored by a model that does not reason. */
	effort?: Effort;
	/** The models the run moves to, in order, when the target fails before it said anything. */
	fallbacks?: readonly ResolvedTarget[];
	/**
	 * A thread run (C429): `text` is the trigger message, the one turn the
	 * transcript keeps (C442); the model reads the channel window instead, with
	 * no history. The route passes no `user`, so the run has no tool, source,
	 * skill, memory or web by construction.
	 */
	thread?: ThreadRun;
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
	agent_invalid: 409,
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
	const packs = input.agent?.knowledge ?? [];
	const pages = input.searchWorkspace === true;
	// A run without a caller has no retrieval at all; a run with neither a
	// workspace search nor a pack has nothing to look for.
	if (!input.user || (!pages && packs.length === 0)) return { sources: [], abstained: false };
	try {
		// The pages only when the client asked for the workspace search; the
		// packs whenever the agent carries knowledge, whether or not it did
		// (C34). The packs need no membership: they are tenant-free.
		const chunks = await retrieve(db, input.user, { query: text, pages, packs });
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
	const { db, redis, runId, conversationId, ownerId, text } = input;
	let target = input.target;
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
		// A custom agent pins its own pair of columns; the built-in pair stays NULL (C301).
		agentId: isCustomAgent(agent) ? null : (agent?.id ?? null),
		agentVersion: isCustomAgent(agent) ? null : (agent?.version ?? null),
		customAgentId: isCustomAgent(agent) ? agent.id : null,
		customAgentVersion: isCustomAgent(agent) ? agent.version : null,
		...(input.thread ? { surface: { channelId: input.thread.channelId, messageId: input.thread.messageId, readAt: input.thread.readAt } } : {}),
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

	// Edit and resend: a run id that holds no message of THIS caller's
	// conversation (foreign, missing, another conversation's) is a 404 before
	// anything is deleted or called. The row just inserted is failed so the
	// conversation is not left "running".
	if (input.replaceFromRunId !== undefined) {
		const known = await hasMessagesOfRun(db, { conversationId, ownerId, runId: input.replaceFromRunId });
		if (!known) {
			await markRun(db, runId, 'failed', 'not_found');
			return { kind: 'refused', status: 404, code: 'not_found' };
		}
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
	const loaded = await loadAttachments(attachments, sessionToken, target.vision === true);
	if (loaded.kind === 'refused') {
		await markRun(db, runId, 'failed', loaded.code);
		return loaded;
	}
	const { images, texts } = loaded;

	// The replaced turns go BEFORE the new user message is written and the
	// history is read: the model must never receive what the user edited away.
	// ai_runs rows stay (usage and billing).
	if (input.replaceFromRunId !== undefined) {
		await deleteMessagesFromRun(db, { conversationId, ownerId, runId: input.replaceFromRunId });
	}
	const files: FittedFile[] = fitFiles(texts, text);

	// The history is read before the money moves: the reservation estimates the
	// size of the prompt, so it has to know the prompt.
	// A thread run reads no history: each "@AI" is one draft (C442).
	const window = input.thread
		? { messages: [], oldestKeptId: null, dropped: false }
		: await loadHistoryWindow(db, { conversationId, ownerId });
	const history = window.messages;
	// The summary of the turns the window dropped, quoted when it ends before
	// the window starts (context C384). Flag off: no column is read (C389).
	const summary = config.summaryEnabled && !input.thread
		? await readRunSummary(db, { conversationId, ownerId, oldestKeptId: window.oldestKeptId, dropped: window.dropped })
		: null;
	const summaryBlockText = summary?.quoted ? conversationSummaryBlock(summary.quoted.text, summary.quoted.through) : undefined;

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
	// C340: the prefix is judged again with the real index, after the row exists
	// and before any money moves, so a refusal leaves reserved_microusd at 0.
	if (isCustomAgent(agent) && prefixCost(agent, skillIndex) > PREFIX_MAX) {
		await markRun(db, runId, 'failed', 'agent_invalid');
		return { kind: 'refused', status: 409, code: 'agent_invalid' };
	}
	// The user's approved memories, loaded ONCE for this run and pinned on its
	// row (C40): a continuation run loads its own, as skills do. The pin is what
	// the run was GIVEN, recorded before it executes: a run that fails before
	// the upstream call still lists them.
	const memories = await memoriesForRun(db, input.user, input.workspaceId);
	await recordMemoryPins(db, runId, memories);
	// U1: the user's rules and own skills, for the user turn. A thread run
	// answers with its own prompt only. Flag off: no query (C1010).
	const userContext = input.thread
		? undefined
		: await userContextForRun(db, { user: input.user, workspaceId: input.workspaceId, research: input.research === true, skillIndex });
	const day = today();
	// The account block, when the client asks for it: who is asking.
	let accountBlockText: string | undefined;
	// The workspace block comes with it (plan H1): which pages the caller can
	// read, under the same Settings switch (C205).
	let workspaceBlockText: string | undefined;
	if (input.account === true && input.user) {
		const runWorkspaceId = input.workspaceId ?? input.user.workspaceId;
		const accountCtx = await loadAccountContext(db, input.user, runWorkspaceId);
		accountBlockText = accountBlock(accountCtx, new Date());
		const overview = await loadWorkspaceOverview(db, input.user, runWorkspaceId);
		if (overview) workspaceBlockText = workspaceBlock(overview, accountCtx.workspaceName);
	}
	// The view block, when the client reports one.
	let viewBlockText: string | undefined;
	if (input.view) {
		viewBlockText = viewBlock(input.view);
	}
	// C265 / C287: the MCP tools of the caller are loaded once, here, so the
	// reservation counts their definitions and the run offers the same list.
	// Only the general assistant gets them (C308): an agent never does. Flag
	// off: no query, nothing (C291).
	const mcpTools = config.mcpClientEnabled && input.user && !agent && !input.research ? await loadMcpTools(db, ownerId) : [];
	// C355 / C369: the web tools, when the flag, the workspace switch and this
	// message all say so, and never for an agent.
	const web = await webOnForRun(db, { asked: input.web, user: input.user, agentful: agent !== null, workspaceId: input.workspaceId });
	const contextChars =
		(accountBlockText?.length ?? 0) +
		(viewBlockText?.length ?? 0) +
		(workspaceBlockText?.length ?? 0) +
		mcpToolChars(mcpTools) +
		webToolChars(web) +
		(summaryBlockText?.length ?? 0) +
		(userContext?.block?.length ?? 0);
	// The reservation is TWO step ceilings: the first step of the loop, and
	// the answer that must follow it. The steps after that ask the ledger
	// for what they need, one at a time (src/runs/loopBudget.ts).
	const estimateInputs = {
		text: input.thread?.prompt ?? text,
		historyChars: historyChars(history),
		pageChars: quotedPageChars(context.pages) + memoryChars(memories) + fileChars(files),
		sourceChars: sourceChars(sources),
		// The system prompt of THIS run: the base one, or the longer one of
		// the agent. The reservation counts what the call really sends.
		systemChars: input.thread ? THREAD_SYSTEM_PROMPT.length : systemPromptFor(agent, skillIndex).length,
		contextChars,
		// The answer of a research step reads a larger pool share (C400).
		...(input.research ? { limits: RESEARCH_LIMITS } : {}),
	};
	// A model that keeps failing rests: it is skipped while a later one is
	// ready (devil C256-C259). The row of the run is pinned to the model that
	// really starts it.
	const ordered = await orderByRest(redis, ownerId, [
		{ target, amount: reservationOf(target, estimateInputs, images.length) },
		...chainSteps(input.fallbacks ?? [], estimateInputs, images.length),
	]);
	const [first, ...fallbacks] = ordered;
	target = first.target;
	const amount = first.amount;
	// A run on a connection of the user is not ours to pay for: the provider
	// bills the user, and our ledger stays out of it.
	const reserved = await reserveTarget(db, target, { userId: ownerId, day, amount });
	if (!reserved) {
		await markRun(db, runId, 'failed', 'budget_exhausted');
		return { kind: 'refused', status: 402, code: 'budget_exhausted' };
	}
	await db.query('update public.ai_runs set reserved_microusd = $2::bigint, model = $3::text where id = $1', [runId, amount, target.modelId]);

	// (c) The user's message joins the transcript, and the conversation takes
	// its title when it has none: one transaction, one question.
	const userParts: unknown[] = [{ type: 'text', text: [text, ...images.map(() => '[image]'), ...files.map((file) => `[file: ${file.name.replaceAll('\n', ' ')}]`)].join('\n') }];
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
			...(input.effort ? { effort: input.effort } : {}),
			emit: input.emit,
			day,
			reserved: amount,
			fallbacks,
			...(target !== input.target ? { restedFrom: input.target.modelId } : {}),
			history,
			pages: context.pages,
			sources,
			abstained,
			user: input.user,
			skippedPageIds: context.skippedPageIds,
			userMessageId: userMessage.id,
			title,
			images,
			files,
			agent,
			skillIndex,
			memories,
			mcpTools,
			web,
			...(input.research ? { research: true } : {}),
			workspaceId: input.workspaceId,
			...(summaryBlockText ? { summaryBlock: summaryBlockText } : {}),
			...(userContext ? { userContext } : {}),
			...(summary && window.dropped ? { truncated: { summarized: summaryBlockText !== undefined } } : {}),
			...(summary?.behind && window.oldestKeptId ? { summarizeFrom: { oldestKeptId: window.oldestKeptId } } : {}),
			...(accountBlockText ? { accountBlock: accountBlockText } : {}),
			...(viewBlockText ? { viewBlock: viewBlockText } : {}),
			...(workspaceBlockText ? { workspaceBlock: workspaceBlockText } : {}),
			...(input.thread ? { thread: input.thread } : {}),
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

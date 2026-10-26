import { z } from 'zod';
import type { ServerResponse } from 'node:http';
import { readJson, sendError, sendJson, sendSseHeaders, writeSseFrame, writeSsePing } from '../http.ts';
import { resolveTarget } from '../gateway/resolve.ts';
import { getOwnedConversation } from '../conversations/repo.ts';
import { getOwnedRun } from '../runs/repo.ts';
import { bearerToken } from '../auth.ts';
import { MEDIA_CAPABILITY_PATH } from '../vision/fetchAttachment.ts';
import { startRun } from '../runs/runner.ts';
import { BUILTIN_AGENT_IDS, findBuiltinAgent } from '../agents/builtins.ts';
import { AgentRefusal, loadRunnableAgent } from '../agents/resolve.ts';
import { config } from '../config.ts';
import { liveMemberWorkspaces } from '../retrieval/acl.ts';
import * as runStore from '../runs/runStore.ts';
import { gateResearch } from '../research/gate.ts';
import { resolveFallbacks } from './fallbacks.ts';
import { UUID, requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The runs: the start, the stream of the events, and the cancellation.
 *
 * A run that is not the caller's is a 404, never a 403: the answer must not
 * tell that it exists.
 */

const startRunSchema = z.object({
	runId: z.string().regex(UUID, 'runId must be a uuid'),
	conversationId: z.string().regex(UUID, 'conversationId must be a uuid'),
	text: z.string().min(1).max(32_000),
	// Research mode (C396): with the flag off the field accepts nothing, so a
	// body that carries it is a 400 and the run of before is untouched (C415).
	mode: (config.researchEnabled ? z.enum(['research']) : z.never()).optional(),
	// Edit and resend: the messages from the first one of this run onward are
	// dropped before the new turn, so the model never sees the edited-away
	// turns. Valid only with the conversationId, which the schema requires.
	replaceFromRunId: z.string().regex(UUID, 'replaceFromRunId must be a uuid').optional(),
	model: z.string().min(1).optional(),
	// The agent that shapes the run: one of the built-ins, or none. An id the
	// service does not know is a bad request — the client never guesses. A
	// uuid is a custom agent, accepted only while OSIONOS_AI_CUSTOM_AGENTS is on (C329).
	agentId: (config.customAgentsEnabled
		? z.union([z.enum(BUILTIN_AGENT_IDS), z.string().regex(UUID)])
		: z.enum(BUILTIN_AGENT_IDS)
	).optional(),
	// The connection the run spends: the platform one, or one of the caller's.
	connectionId: z.string().min(1).max(64).optional(),
	// The models the run moves to, in order, when the target fails before it
	// said anything (devil C254). Absent is the run of before.
	fallbacks: z.array(z.object({
		connectionId: z.string().min(1).max(64).optional(),
		model: z.string().min(1).max(200),
	}).strict()).max(2).optional(),
	// How hard a reasoning model thinks. Absent is the run of before.
	effort: z.enum(['low', 'medium', 'high']).optional(),
	attachments: z.array(z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('chat'), id: z.string().regex(UUID, 'id must be a uuid') }).strict(),
		z.object({
			kind: z.literal('media'),
			path: z.string().regex(MEDIA_CAPABILITY_PATH, 'path must match SERVE_RE'),
			// Display data for a file: the bytes decide its type, never the name.
			name: z.string().max(200).optional(),
		}).strict(),
	])).max(4).optional(),
	context: z
		.object({
			// At most three pages: the prompt carries them, and the prompt has a size.
			pageIds: z.array(z.string().regex(UUID, 'pageIds must be uuids')).max(3).optional(),
			// The whole workspace of the caller is searched: the run quotes the
			// pages that answer the question, and the client gets them as
			// `citation` events.
			workspace: z.boolean().optional(),
			// The account block: who is asking. True adds it; absent or false does not.
			account: z.boolean().optional(),
			// The web toggle of this message (C355): ignored unless OSIONOS_AI_WEB
			// and the workspace switch are on too.
			web: z.boolean().optional(),
			// What the caller has open.
			view: z
				.object({
					route: z.string().min(1).max(200),
					layout: z.enum(['single', 'split']),
					activePage: z
						.object({
							id: z.string().regex(UUID, 'activePage.id must be a uuid'),
							title: z.string().max(120),
						})
						.strict()
						.optional(),
					tabs: z
						.array(
							z
								.object({
									title: z.string().max(120),
									kind: z.enum(['page', 'database', 'app', 'other']),
									pageId: z.string().regex(UUID, 'tabs.pageId must be a uuid').optional(),
								})
								.strict(),
						)
						.max(8)
						.optional(),
					panel: z
						.enum([
							'files', 'search', 'marketplace', 'agents', 'conversations',
							'notifications', 'tasks', 'public', 'database', 'scm', 'run',
							'problems', 'issues',
						])
						.optional(),
				})
				.strict()
				.optional(),
		})
		.strict()
		.optional(),
}).strict();

/** A quiet stream is kept alive with a comment every fifteen seconds. */
const SSE_PING_MS = 15_000;

/** The ping of a stream, and the way to stop it. */
export function startPing(response: ServerResponse): () => void {
	const timer = setInterval(() => writeSsePing(response), SSE_PING_MS);
	const stop = () => clearInterval(timer);
	response.on('close', stop);
	return stop;
}

/**
 * The events of a run, after the id the client last saw: the replay first, then
 * the live ones, each event exactly once.
 *
 * The client closing the connection stops the reading, never the run: the run
 * keeps going and stays resumable.
 */
async function streamRunEvents(ctx: RouteContext, runId: string, afterId: string): Promise<void> {
	const { response, deps } = ctx;
	const controller = new AbortController();
	const stop = () => controller.abort();
	response.on('close', stop);
	try {
		// A research report outgrows the stream's cap: say so first (C402).
		if (config.researchEnabled && (await runStore.hasGap(deps.redis, runId, afterId))) {
			writeSseFrame(response, { id: afterId, type: 'resume.gap', data: {} });
		}
		const entries = await runStore.readAfter(deps.redis, runId, afterId);
		for (const entry of entries) writeSseFrame(response, entry);
		const last = entries.length > 0 ? entries[entries.length - 1] : undefined;
		if (last && runStore.TERMINAL_TYPES.has(last.type)) return;
		await runStore.follow(
			deps.blockingRedis,
			runId,
			last?.id ?? afterId,
			(entry) => writeSseFrame(response, entry),
			controller.signal,
		);
	} finally {
		response.off('close', stop);
	}
}

/**
 * The same run, asked again: its stream is replayed, and no model is called a
 * second time.
 */
export async function replayRun(ctx: RouteContext, runId: string): Promise<number> {
	if (!(await runStore.exists(ctx.deps.redis, runId))) {
		sendError(ctx.response, 410, 'run_expired');
		return 410;
	}
	sendSseHeaders(ctx.response);
	const stopPing = startPing(ctx.response);
	await streamRunEvents(ctx, runId, '');
	stopPing();
	if (!ctx.response.writableEnded && !ctx.response.destroyed) ctx.response.end();
	return 200;
}

/** POST /api/ai/runs */
export async function handleRuns(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const body = await readJson(ctx.request, startRunSchema);
	// The target of the run: the platform connection, or one of the caller's.
	const resolved = await resolveTarget(ctx.deps.db, ctx.deps.redis, user, body.connectionId, body.model);
	if (resolved.kind === 'refused') {
		sendError(ctx.response, resolved.status, resolved.code);
		return resolved.status;
	}
	const chain = await resolveFallbacks(ctx, user, body);
	if (chain.kind === 'refused') {
		sendError(ctx.response, 400, 'invalid_fallback');
		return 400;
	}
	const conversation = await getOwnedConversation(ctx.deps.db, { id: body.conversationId, ownerId: user.userId });
	if (!conversation) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const pageIds = body.context?.pageIds ?? [];
	const sessionToken = bearerToken(ctx.request) ?? '';
	// The whole workspace of the caller is searched: the run quotes what it
	// finds, and every page it quotes is checked again with the bridge's rule.
	const searchWorkspace = body.context?.workspace === true;
	// The workspaces of the caller are the gate of the pages, read LIVE from the
	// members table (C127): the token's list outlives a removal by up to an
	// hour. They are read only when the client quotes something; the search
	// reads them again, on its own, when it needs them.
	const workspaces = pageIds.length > 0 ? await liveMemberWorkspaces(ctx.deps.db, user) : [];
	// The agent of the run: the built-in the client named, or none. The id
	// came through the schema, so it is one of ours; the agent itself is read
	// from the registry, never taken from the request.
	let agent;
	try {
		agent = !body.agentId
			? null
			: UUID.test(body.agentId)
				? await loadRunnableAgent(ctx.deps.db, user, body.agentId, conversation.workspace_id)
				: findBuiltinAgent(body.agentId);
	} catch (error) {
		if (!(error instanceof AgentRefusal)) throw error;
		sendError(ctx.response, error.status, error.code);
		return error.status;
	}
	const research = await gateResearch(ctx.deps, {
		mode: body.mode,
		web: body.context?.web,
		user,
		agentful: agent !== null,
		workspaceId: conversation.workspace_id,
		runId: body.runId,
		targets: [resolved.target, ...chain.targets],
	});
	if (research.kind === 'refused') {
		if (research.retryAfterSeconds !== undefined) ctx.response.setHeader('retry-after', String(research.retryAfterSeconds));
		sendError(ctx.response, research.status, research.code);
		return research.status;
	}
	const outcome = await startRun({
		db: ctx.deps.db,
		redis: ctx.deps.redis,
		runId: body.runId,
		conversationId: body.conversationId,
		ownerId: user.userId,
		text: body.text,
		replaceFromRunId: body.replaceFromRunId,
		target: resolved.target,
		effort: body.effort,
		fallbacks: chain.targets,
		pageIds,
		memberWorkspaceIds: workspaces,
		user,
		searchWorkspace,
		attachments: body.attachments,
		sessionToken,
		agent,
		workspaceId: conversation.workspace_id,
		account: body.context?.account,
		web: body.context?.web,
		...(research.research ? { research: true } : {}),
		view: body.context?.view,
		emit: (event) => writeSseFrame(ctx.response, event),
	}).catch(async (error: unknown) => {
		// A start that throws never runs: the slot and the seat go back.
		await research.release();
		await research.refund();
		throw error;
	});
	// Only a run that executes keeps the slot and the day's seat (C401, C404).
	if (outcome.kind !== 'started') {
		await research.release();
		await research.refund();
	}
	if (outcome.kind === 'refused') {
		// A rate limit says when to come back: the client counts the seconds
		// down before it offers the retry.
		if (outcome.retryAfterSeconds !== undefined) {
			ctx.response.setHeader('retry-after', String(outcome.retryAfterSeconds));
		}
		sendError(ctx.response, outcome.status, outcome.code);
		return outcome.status;
	}
	if (outcome.kind === 'reattach') return replayRun(ctx, body.runId);
	sendSseHeaders(ctx.response);
	const stopPing = startPing(ctx.response);
	try {
		await outcome.execute();
	} finally {
		await research.release();
		stopPing();
		if (!ctx.response.writableEnded && !ctx.response.destroyed) ctx.response.end();
	}
	return 200;
}

/** GET /api/ai/runs/:id/events */
export async function handleRunEvents(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const runId = ctx.params[0] ?? '';
	if (!UUID.test(runId)) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	// The owner check is the gate: a run of somebody else does not exist
	// for this caller.
	const run = await getOwnedRun(ctx.deps.db, { id: runId, ownerId: user.userId });
	if (!run) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	if (!(await runStore.exists(ctx.deps.redis, runId))) {
		sendError(ctx.response, 410, 'run_expired');
		return 410;
	}
	const header = ctx.request.headers['last-event-id'];
	const afterId =
		(typeof header === 'string' && header.length > 0 ? header : ctx.url.searchParams.get('after')) ?? '';
	sendSseHeaders(ctx.response);
	const stopPing = startPing(ctx.response);
	await streamRunEvents(ctx, runId, afterId);
	stopPing();
	if (!ctx.response.writableEnded && !ctx.response.destroyed) ctx.response.end();
	return 200;
}

/** POST /api/ai/runs/:id/cancel */
export async function handleRunCancel(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const runId = ctx.params[0] ?? '';
	if (!UUID.test(runId)) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const run = await getOwnedRun(ctx.deps.db, { id: runId, ownerId: user.userId });
	if (!run) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	// The cancellation travels on the channel: the replica that runs the
	// model is the one that stops it.
	await runStore.publishCancel(ctx.deps.redis, runId);
	const status = 202;
	sendJson(ctx.response, status, { ok: true, runId });
	return status;
}

import { z } from 'zod';
import { readJson, sendError, sendSseHeaders, writeSseFrame } from '../http.ts';
import { getOwnedConversation } from '../conversations/repo.ts';
import { getRun } from '../runs/repo.ts';
import { startRun } from '../runs/runner.ts';
import { admitThread, threadTargets } from '../threads/admission.ts';
import type { Admitted, Refused } from '../threads/admission.ts';
import { channelWorkspace, loadThreadWindow, threadPrompt, triggerRefusal } from '../threads/context.ts';
import type { ThreadMessage } from '../threads/context.ts';
import type { ResolvedTarget } from '../gateway/resolve.ts';
import { replayRun, startPing } from './runs.ts';
import { UUID, requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * POST /api/ai/thread-runs: "@AI" in a text channel drafts an answer for the
 * member who asked (C429). The route exists only with OSIONOS_AI_THREAD_ANSWERS
 * on (C450).
 *
 * The body names the run, the asker's conversation and the trigger, and
 * nothing else (C433): the text is the trigger row's, the model is the head
 * of the no-train Auto chain and its failover the rest of it (C434 as amended
 * by osio-bot OB9), and the run has no tool, page, source, attachment, agent
 * or memory. A new run is admitted before startRun (OB8, OB10, C449).
 */
const threadRunSchema = z.object({
	runId: z.string().regex(UUID, 'runId must be a uuid'),
	conversationId: z.string().regex(UUID, 'conversationId must be a uuid'),
	channelId: z.string().regex(UUID, 'channelId must be a uuid'),
	messageId: z.string().regex(UUID, 'messageId must be a uuid'),
}).strict();

const TRIGGER_STATUS = { not_found: 404, no_mention: 400, trigger_stale: 409 } as const;

type Scope = { channelId: string; userId: string; messageId: string };
type Targets = { target: ResolvedTarget; fallbacks: ResolvedTarget[] };

const nothing = async (): Promise<void> => {};
const REPLAY: Admitted = { kind: 'admitted', release: nothing, refund: nothing };

export async function handleThreadRuns(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const body = await readJson(ctx.request, threadRunSchema);
	const { db, redis } = ctx.deps;
	const refuse = refuser(ctx);
	const targets = await threadTargets(db, redis, user);
	if (targets.kind === 'refused') return refuse(targets);
	const read = await readTrigger(ctx, user.userId, body);
	if ('refused' in read) return refuse(read.refused);
	const { scope, window, workspaceId } = read;
	// A run id already started re-attaches to that run: replaying it spends no bucket and takes no lock.
	const admitted = (await getRun(db, body.runId)) ? REPLAY : await admitThread(redis, { channelId: body.channelId, workspaceId, userId: user.userId, runId: body.runId });
	if (admitted.kind === 'refused') return refuse(admitted);
	try {
		return await runThread(ctx, { ...body, scope, window, targets }, admitted.refund);
	} finally {
		await admitted.release();
	}
}

/** The asker's conversation, the trigger's window and the channel's workspace, or the refusal (C448, C452). */
async function readTrigger(
	ctx: RouteContext,
	userId: string,
	body: { conversationId: string; channelId: string; messageId: string },
): Promise<{ refused: { status: number; code: string } } | { scope: Scope; window: ThreadMessage[]; workspaceId: string }> {
	const { db } = ctx.deps;
	const notFound = { refused: { status: 404, code: 'not_found' } };
	if (!(await getOwnedConversation(db, { id: body.conversationId, ownerId: userId }))) return notFound;
	const scope = { channelId: body.channelId, userId, messageId: body.messageId };
	const window = await loadThreadWindow(db, scope);
	const refusal = triggerRefusal(window);
	if (refusal) return { refused: { status: TRIGGER_STATUS[refusal], code: refusal } };
	const workspaceId = await channelWorkspace(db, body.channelId);
	return workspaceId ? { scope, window, workspaceId } : notFound;
}

function refuser(ctx: RouteContext): (refused: Pick<Refused, 'status' | 'code' | 'retryAfterSeconds'>) => number {
	return ({ status, code, retryAfterSeconds }) => {
		if (retryAfterSeconds !== undefined) ctx.response.setHeader('retry-after', String(retryAfterSeconds));
		sendError(ctx.response, status, code);
		return status;
	};
}

type ThreadRunPlan = { runId: string; conversationId: string; scope: Scope; window: ThreadMessage[]; targets: Targets };

/** A run startRun does not start (refused, re-attached or thrown) reaches no model: `refund` gives its day's seats back. */
async function runThread(ctx: RouteContext, run: ThreadRunPlan, refund: () => Promise<void>): Promise<number> {
	const outcome = await startRun(threadRunInput(ctx, run)).catch(async (error: unknown) => {
		await refund();
		throw error;
	});
	if (outcome.kind !== 'started') await refund();
	if (outcome.kind === 'refused') return refuser(ctx)(outcome);
	if (outcome.kind === 'reattach') return replayRun(ctx, run.runId);
	sendSseHeaders(ctx.response);
	const stopPing = startPing(ctx.response);
	try {
		await outcome.execute();
	} finally {
		stopPing();
		if (!ctx.response.writableEnded && !ctx.response.destroyed) ctx.response.end();
	}
	return 200;
}

function threadRunInput(ctx: RouteContext, { runId, conversationId, scope, window, targets }: ThreadRunPlan): Parameters<typeof startRun>[0] {
	const { db, redis } = ctx.deps;
	const trigger = window[window.length - 1];
	return {
		db,
		redis,
		runId,
		conversationId,
		ownerId: scope.userId,
		text: trigger.content,
		target: targets.target,
		fallbacks: targets.fallbacks,
		// The chain was built from the rests already (autoChainFor).
		restFiltered: true,
		runKind: 'thread',
		credential: null,
		thread: {
			prompt: threadPrompt(window),
			channelId: scope.channelId,
			messageId: scope.messageId,
			readAt: trigger.readAt,
			stillAllowed: async () => (await loadThreadWindow(db, scope)).length > 0,
		},
		emit: (event) => writeSseFrame(ctx.response, event),
	};
}

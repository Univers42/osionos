import { z } from 'zod';
import { readJson, sendError, sendSseHeaders, writeSseFrame } from '../http.ts';
import { resolveTarget } from '../gateway/resolve.ts';
import { getOwnedConversation } from '../conversations/repo.ts';
import { startRun } from '../runs/runner.ts';
import { admitThreadRun, channelWorkspace, loadThreadWindow, threadPrompt, triggerRefusal } from '../threads/context.ts';
import { replayRun, startPing } from './runs.ts';
import { UUID, requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * POST /api/ai/thread-runs: "@AI" in a text channel drafts an answer for the
 * member who asked (C429). The route exists only with OSIONOS_AI_THREAD_ANSWERS
 * on (C450).
 *
 * The body names the run, the asker's conversation and the trigger, and
 * nothing else (C433): the text is the trigger row's, the model is the
 * platform default with no fallback (C434), and the run has no tool, page,
 * source, attachment, agent or memory.
 */
const threadRunSchema = z.object({
	runId: z.string().regex(UUID, 'runId must be a uuid'),
	conversationId: z.string().regex(UUID, 'conversationId must be a uuid'),
	channelId: z.string().regex(UUID, 'channelId must be a uuid'),
	messageId: z.string().regex(UUID, 'messageId must be a uuid'),
}).strict();

const TRIGGER_STATUS = { not_found: 404, no_mention: 400, trigger_stale: 409 } as const;

export async function handleThreadRuns(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const body = await readJson(ctx.request, threadRunSchema);
	const { db, redis } = ctx.deps;
	const refuse = (status: number, code: string, retryAfterSeconds?: number): number => {
		if (retryAfterSeconds !== undefined) ctx.response.setHeader('retry-after', String(retryAfterSeconds));
		sendError(ctx.response, status, code);
		return status;
	};
	const resolved = await resolveTarget(db, redis, user, undefined);
	if (resolved.kind === 'refused') return refuse(resolved.status, resolved.code);
	const conversation = await getOwnedConversation(db, { id: body.conversationId, ownerId: user.userId });
	if (!conversation) return refuse(404, 'not_found');
	const scope = { channelId: body.channelId, userId: user.userId, messageId: body.messageId };
	const window = await loadThreadWindow(db, scope);
	const refusal = triggerRefusal(window);
	if (refusal) return refuse(TRIGGER_STATUS[refusal], refusal);
	const workspaceId = await channelWorkspace(db, body.channelId);
	if (!workspaceId) return refuse(404, 'not_found');
	const admitted = await admitThreadRun(redis, { channelId: body.channelId, workspaceId });
	if (admitted.kind === 'refused') return refuse(admitted.status, admitted.code, admitted.retryAfterSeconds);

	const outcome = await startRun({
		db,
		redis,
		runId: body.runId,
		conversationId: body.conversationId,
		ownerId: user.userId,
		text: window[window.length - 1].content,
		target: resolved.target,
		thread: {
			prompt: threadPrompt(window),
			channelId: body.channelId,
			messageId: body.messageId,
			stillAllowed: async () => (await loadThreadWindow(db, scope)).length > 0,
		},
		emit: (event) => writeSseFrame(ctx.response, event),
	});
	if (outcome.kind === 'refused') return refuse(outcome.status, outcome.code, outcome.retryAfterSeconds);
	if (outcome.kind === 'reattach') return replayRun(ctx, body.runId);
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

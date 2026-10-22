import { z } from 'zod';
import type { AuthUser } from '../auth.ts';
import { readJson, sendError, sendJson } from '../http.ts';
import { canAccessWorkspace } from '../workspaceAccess.ts';
import { createConversation, getOwnedConversation, listConversations, listMessages } from '../conversations/repo.ts';
import { UUID, requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The conversations of a user: the inbox, the creation, and the transcript.
 *
 * A conversation of somebody else is a 404, never a 403: the answer must not
 * tell that it exists.
 */

const createConversationSchema = z.object({
	workspaceId: z.string().regex(UUID, 'workspaceId must be a uuid'),
	title: z.string().max(200).optional(),
});

/** GET /api/ai/conversations/:id/messages */
export async function handleConversationMessages(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const conversationId = ctx.params[0] ?? '';
	// An id that is no uuid is a 404 as well.
	if (!UUID.test(conversationId)) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const conversation = await getOwnedConversation(ctx.deps.db, { id: conversationId, ownerId: user.userId });
	if (!conversation) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const transcript = await listMessages(ctx.deps.db, { conversationId, ownerId: user.userId });
	const status = 200;
	sendJson(ctx.response, status, { conversationId, messages: transcript });
	return status;
}

/** POST /api/ai/conversations */
async function handleCreateConversation(ctx: RouteContext, user: AuthUser): Promise<number> {
	const body = await readJson(ctx.request, createConversationSchema);
	const allowed = await canAccessWorkspace(ctx.deps.db, user, body.workspaceId, 'create');
	if (!allowed) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const conversation = await createConversation(ctx.deps.db, {
		ownerId: user.userId,
		workspaceId: body.workspaceId,
		title: body.title ?? '',
	});
	const status = 201;
	sendJson(ctx.response, status, conversation);
	return status;
}

/** GET /api/ai/conversations?workspaceId= */
async function handleListConversations(ctx: RouteContext, user: AuthUser): Promise<number> {
	const workspaceId = ctx.url.searchParams.get('workspaceId') ?? '';
	if (!UUID.test(workspaceId)) {
		sendError(ctx.response, 400, 'invalid_request');
		return 400;
	}
	// The owner filter is the gate: the answer holds the caller's own
	// conversations of that workspace, and nothing else.
	const conversations = await listConversations(ctx.deps.db, {
		ownerId: user.userId,
		workspaceId,
		limit: 50,
	});
	const status = 200;
	sendJson(ctx.response, status, { conversations });
	return status;
}

/** POST and GET /api/ai/conversations */
export async function handleConversations(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	if (ctx.request.method === 'POST') return handleCreateConversation(ctx, user);
	if (ctx.request.method === 'GET') return handleListConversations(ctx, user);
	sendError(ctx.response, 405, 'method_not_allowed');
	return 405;
}

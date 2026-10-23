import { z } from 'zod';
import { readJson, sendError, sendJson } from '../http.ts';
import { liveMemberWorkspaces } from '../retrieval/acl.ts';
import { approve, archive, edit, list, reject } from '../memory/repo.ts';
import type { ChangeOutcome, Memory } from '../memory/repo.ts';
import { UUID, requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The caller's own AI memories (devil C41): there is no workspace-wide view and
 * no admin override. Every route below acts on `user_id = caller` only, and a
 * memory of someone else answers exactly like an id that does not exist.
 *
 * GET   /api/ai/workspaces/:ws/memories
 * POST  /api/ai/memories/:id/approve | reject | archive
 * PATCH /api/ai/memories/:id   {body}
 */

const editSchema = z.object({ body: z.string() }).strict();

function toContract(memory: Memory): Record<string, unknown> {
	return {
		id: memory.id,
		workspaceId: memory.workspace_id,
		body: memory.body,
		status: memory.status,
		version: memory.version,
		updatedAt: memory.updated_at.toISOString(),
	};
}

function answer(ctx: RouteContext, outcome: ChangeOutcome): number {
	if (outcome.ok) {
		sendJson(ctx.response, 200, toContract(outcome.memory));
		return 200;
	}
	const status = { not_found: 404, wrong_state: 409, too_many_approved: 409, empty: 400, too_long: 400 }[outcome.reason];
	const code = outcome.reason === 'not_found' ? 'not_found' : outcome.reason;
	sendError(ctx.response, status, code);
	return status;
}

/** GET /api/ai/workspaces/:ws/memories */
export async function handleMemoriesList(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return ctx.response.statusCode;
	const workspaceId = ctx.params[0] ?? '';
	const live = UUID.test(workspaceId) ? await liveMemberWorkspaces(ctx.deps.db, user) : [];
	if (!live.includes(workspaceId)) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const memories = await list(ctx.deps.db, { userId: user.userId, workspaceId });
	sendJson(ctx.response, 200, { memories: memories.map(toContract) });
	return 200;
}

type Decision = typeof approve;

function decide(change: Decision) {
	return async (ctx: RouteContext): Promise<number> => {
		const user = requireUser(ctx);
		if (!user) return ctx.response.statusCode;
		const memoryId = ctx.params[0] ?? '';
		if (!UUID.test(memoryId)) {
			sendError(ctx.response, 404, 'not_found');
			return 404;
		}
		return answer(ctx, await change(ctx.deps.db, { userId: user.userId, memoryId }));
	};
}

export const handleMemoryApprove = decide(approve);
export const handleMemoryReject = decide(reject);
export const handleMemoryArchive = decide(archive);

/** PATCH /api/ai/memories/:id */
export async function handleMemoryEdit(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return ctx.response.statusCode;
	const memoryId = ctx.params[0] ?? '';
	if (!UUID.test(memoryId)) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const body = await readJson(ctx.request, editSchema);
	return answer(ctx, await edit(ctx.deps.db, { userId: user.userId, memoryId, body: body.body }));
}

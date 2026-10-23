import { z } from 'zod';
import type { AuthUser } from '../auth.ts';
import { readJson, sendError, sendJson } from '../http.ts';
import { canAccessWorkspace } from '../workspaceAccess.ts';
import type { WorkspacePermission } from '../workspaceAccess.ts';
import { requireUser, UUID } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The opt-in switch of AI sentiment, per workspace (C138): off by default,
 * switched only by a LIVE owner or admin.
 *
 * Turning it off deletes every score of the workspace in the same transaction
 * (the trigger of models/osionos-ugc-sentiment-migration.sql, C143).
 */

const putSchema = z.object({ enabled: z.boolean() }).strict();

// The token's own-workspace shortcut of canAccessWorkspace is NOT used: a
// session token can be an hour stale, and C138 asks for the members table at
// request time. Blanking the claim leaves only the live row.
async function liveAccess(ctx: RouteContext, user: AuthUser, workspaceId: string, permission: WorkspacePermission): Promise<boolean> {
	return canAccessWorkspace(ctx.deps.db, { ...user, workspaceId: '' }, workspaceId, permission);
}

/** GET|PUT /api/ai/workspaces/:workspaceId/sentiment/settings */
export async function handleSentimentSettings(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const workspaceId = ctx.params[0] ?? '';
	if (!UUID.test(workspaceId)) {
		sendError(ctx.response, 400, 'invalid_request');
		return 400;
	}
	const method = ctx.request.method ?? '';
	if (method !== 'GET' && method !== 'PUT') {
		sendError(ctx.response, 405, 'method_not_allowed');
		return 405;
	}

	// Not a reader: 404, so the existence of a workspace does not leak.
	if (!(await liveAccess(ctx, user, workspaceId, 'read'))) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}

	if (method === 'GET') {
		const result = await ctx.deps.db.query<{ enabled: boolean }>(
			'select enabled from public.ai_sentiment_settings where workspace_id = $1',
			[workspaceId],
		);
		sendJson(ctx.response, 200, { enabled: result.rows[0]?.enabled ?? false });
		return 200;
	}

	const body = await readJson(ctx.request, putSchema);
	if (!(await liveAccess(ctx, user, workspaceId, 'admin'))) {
		sendError(ctx.response, 403, 'forbidden');
		return 403;
	}
	await ctx.deps.db.query(
		`insert into public.ai_sentiment_settings (workspace_id, enabled, updated_by, updated_at)
		 values ($1, $2, $3, now())
		 on conflict (workspace_id) do update
		   set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now()`,
		[workspaceId, body.enabled, user.userId],
	);
	sendJson(ctx.response, 200, { enabled: body.enabled });
	return 200;
}

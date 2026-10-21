import { sendError, sendJson } from '../http.ts';
import { connectionModels } from '../connections/models.ts';
import { connectionSecret, PLATFORM_CONNECTION_ID } from '../connections/service.ts';
import { getOwnedConnection } from '../connections/repo.ts';
import { platformModels } from '../gateway/platform.ts';
import { requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The models of the platform, and the models of a connection.
 *
 * The prices stay on the server: the client only needs to show a name.
 */

/** GET /api/ai/models */
export async function handleModels(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const connectionId = (ctx.url.searchParams.get('connectionId') ?? '').trim();
	if (!connectionId || connectionId === PLATFORM_CONNECTION_ID) {
		const status = 200;
		sendJson(ctx.response, status, {
			models: platformModels().map((model) => ({ id: model.id, label: model.label, default: model.default })),
		});
		return status;
	}
	// A connection of somebody else does not exist for this caller.
	const row = await getOwnedConnection(ctx.deps.db, { id: connectionId, ownerUserId: user.userId });
	if (!row) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const models = await connectionModels(ctx.deps.redis, row, connectionSecret(row));
	const status = 200;
	sendJson(ctx.response, status, { models });
	return status;
}

import { sendJson } from '../http.ts';
import { platformModels } from '../gateway/platform.ts';
import { requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The models of the platform: the ids and the labels the client shows.
 */

/** GET /api/ai/models */
export async function handleModels(ctx: RouteContext): Promise<number> {
	if (!requireUser(ctx)) return 401;
	// The prices stay on the server: the client only needs to show a name.
	const status = 200;
	sendJson(ctx.response, status, {
		models: platformModels().map((model) => ({ id: model.id, label: model.label, default: model.default })),
	});
	return status;
}

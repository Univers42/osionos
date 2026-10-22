import { sendError, sendJson } from '../http.ts';
import { builtinCommands } from '../commands/builtins.ts';
import type { CommandSurfaceFilter } from '../commands/builtins.ts';
import { requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The registry of the commands: the built-ins, filtered by the surface the
 * client asks for.
 *
 * GET /api/ai/commands?surface=editor|chat
 */
export async function handleCommands(ctx: RouteContext): Promise<number> {
	if (!requireUser(ctx)) return 401;
	const asked = ctx.url.searchParams.get('surface');
	if (asked !== null && asked !== 'editor' && asked !== 'chat') {
		sendError(ctx.response, 400, 'invalid_request');
		return 400;
	}
	const surface = (asked as CommandSurfaceFilter | null) ?? undefined;
	const status = 200;
	sendJson(ctx.response, status, { commands: builtinCommands(surface) });
	return status;
}

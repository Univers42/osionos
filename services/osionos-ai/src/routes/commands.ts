import { config } from '../config.ts';
import { sendError, sendJson } from '../http.ts';
import { builtinCommands } from '../commands/builtins.ts';
import type { CommandSurfaceFilter } from '../commands/builtins.ts';
import { toUserCommands } from '../commands/userCommands.ts';
import { listActiveItems } from '../context/repo.ts';
import { requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The registry of the commands: the built-ins, filtered by the surface the
 * client asks for, then the caller's own on the chat surface (U2, flag
 * OSIONOS_AI_USER_COMMANDS). Flag off: the built-ins alone, no query (C1103).
 *
 * GET /api/ai/commands?surface=editor|chat
 */
export async function handleCommands(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const asked = ctx.url.searchParams.get('surface');
	if (asked !== null && asked !== 'editor' && asked !== 'chat') {
		sendError(ctx.response, 400, 'invalid_request');
		return 400;
	}
	const surface = (asked as CommandSurfaceFilter | null) ?? undefined;
	const status = 200;
	const own = config.userCommandsEnabled && surface !== 'editor' ? await ownCommands(ctx, user.userId) : [];
	sendJson(ctx.response, status, { commands: [...builtinCommands(surface), ...own] });
	return status;
}

/**
 * A failed read of the user's commands (the U2 table not migrated yet, a dead
 * connection) costs the user's own commands, never the built-ins: the palette
 * keeps working on an empty list.
 */
async function ownCommands(ctx: RouteContext, userId: string): Promise<ReturnType<typeof toUserCommands>> {
	try {
		return toUserCommands(await listActiveItems(ctx.deps.db, { scope: 'user', ownerId: userId }, ['command']));
	} catch (error) {
		console.warn(JSON.stringify({ event: 'user_commands_unavailable', code: (error as Error).name }));
		return [];
	}
}

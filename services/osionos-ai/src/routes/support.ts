import { authenticate } from '../auth.ts';
import type { AuthUser } from '../auth.ts';
import { sendError } from '../http.ts';
import type { RouteContext } from './types.ts';

/**
 * The small helpers every route needs: the uuid shape and the caller.
 */

/** The UUID shape the bridge's tokens carry (scripts/bridge-session-token.mjs:10). */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The caller of a request, or null when the request carries no valid app-session
 * token. A refusal is written for the caller, and the handler stops there.
 */
export function requireUser(ctx: RouteContext): AuthUser | null {
	const user = authenticate(ctx.request);
	if (!user) {
		sendError(ctx.response, 401, 'unauthorized');
		return null;
	}
	return user;
}

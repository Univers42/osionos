import { config } from '../config.ts';
import { sendJson } from '../http.ts';
import { requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The flag-gated features this deployment serves. Off, each one's paths answer the router's own
 * 404, and Chrome logs every 404 as a console error (#293), so the app reads the switches here
 * once per session instead of probing each route. Each name mirrors the flag that adds its routes
 * to table.ts.
 */

/** GET /api/ai/capabilities */
export async function handleCapabilities(ctx: RouteContext): Promise<number> {
	if (!requireUser(ctx)) return 401;
	const status = 200;
	sendJson(ctx.response, status, {
		capabilities: {
			accessTokens: config.patEnabled,
			mcpServers: config.mcpClientEnabled,
			customAgents: config.customAgentsEnabled,
			web: config.webEnabled,
			threadAnswers: config.threadAnswersEnabled,
		},
	});
	return status;
}

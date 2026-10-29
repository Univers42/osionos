import { sendJson } from '../http.ts';
import { listedAgents } from '../agents/builtins.ts';
import { config } from '../config.ts';
import { listCustomViews } from './agentsRead.ts';
import { requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The built-in agents: what a run can be.
 *
 * GET /api/ai/agents
 *
 * The list carries the id, the version, the name and the description — and
 * NOTHING else. The instructions of an agent are the text of the server's
 * prompt: they are not the client's business, and a client that holds them
 * can read them out loud.
 */
export async function handleAgents(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const status = 200;
	// Flag off: the answer of before, byte for byte. Flag on: the custom agents
	// the caller may see follow the built-ins, without their instructions (C332).
	const builtins = listedAgents();
	sendJson(ctx.response, status, config.customAgentsEnabled ? [...builtins, ...(await listCustomViews(ctx.deps.db, user))] : builtins);
	return status;
}

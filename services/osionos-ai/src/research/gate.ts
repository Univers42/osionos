import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { AuthUser } from '../auth.ts';
import { config } from '../config.ts';
import type { ResolvedTarget } from '../gateway/resolve.ts';
import { webOnForRun } from '../web/runWeb.ts';
import { admitResearch } from './admission.ts';

/**
 * The route's decision on `mode: 'research'`, in one call (C396, C397, C401, C404).
 *
 * Order: the web must be on for THIS run (the flag, the workspace switch and
 * the message's own toggle, and a SearXNG to search with), then the busy
 * gate, then the day's quota. Every refusal comes before the run's row, so a
 * refused run costs nothing and leaves nothing.
 *
 * A failover target that the platform pays for counts as a platform run: a
 * user's own model that fails over to ours must not skip the quota.
 */

export type ResearchGate =
	| { kind: 'refused'; status: number; code: string; retryAfterSeconds?: number }
	| { kind: 'ok'; research: boolean; release: () => Promise<void>; refund: () => Promise<void> };

const nothing = async (): Promise<void> => undefined;
export const NOT_RESEARCH: ResearchGate = { kind: 'ok', research: false, release: nothing, refund: nothing };

export async function gateResearch(
	deps: { db: Pool; redis: Redis },
	input: {
		mode: 'research' | undefined;
		web: boolean | undefined;
		user: AuthUser;
		agentful: boolean;
		workspaceId: string;
		runId: string;
		targets: readonly ResolvedTarget[];
	},
): Promise<ResearchGate> {
	if (input.mode !== 'research') return NOT_RESEARCH;
	const webOn =
		Boolean(config.searxngUrl) &&
		(await webOnForRun(deps.db, { asked: input.web, user: input.user, agentful: input.agentful, workspaceId: input.workspaceId }));
	if (!webOn) return { kind: 'refused', status: 400, code: 'research_needs_web' };
	const admission = await admitResearch(deps.redis, {
		userId: input.user.userId,
		runId: input.runId,
		platformPays: input.targets.some((target) => target.platformBudget),
	});
	if (admission.kind === 'refused') {
		return { kind: 'refused', status: 429, code: admission.code, ...(admission.retryAfterSeconds ? { retryAfterSeconds: admission.retryAfterSeconds } : {}) };
	}
	return { kind: 'ok', research: true, release: admission.release, refund: admission.refund };
}

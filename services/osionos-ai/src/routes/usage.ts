import { config } from '../config.ts';
import { sendJson } from '../http.ts';
import { today } from '../runs/runner.ts';
import { requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The usage of the caller for the day: what the platform connection spent of
 * the user's own budget.
 *
 * The spend of a connection of the user is not here: their provider bills
 * them, and we never see the money.
 */

/** GET /api/ai/usage */
export async function handleUsage(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const day = today();
	const result = await ctx.deps.db.query(
		'select spent_microusd from public.ai_usage_daily where subject = $1 and day = $2',
		[user.userId, day],
	);
	const spent = Number(result.rows[0]?.spent_microusd ?? 0);
	const status = 200;
	sendJson(ctx.response, status, {
		day,
		spentMicroUsd: spent,
		limitMicroUsd: config.userDailyMicroUsd,
	});
	return status;
}

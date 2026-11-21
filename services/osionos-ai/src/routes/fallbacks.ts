import { resolveTarget } from '../gateway/resolve.ts';
import type { ResolvedTarget } from '../gateway/resolve.ts';
import type { AuthUser } from '../auth.ts';
import type { RouteContext } from './types.ts';

/**
 * The fallbacks of a run, resolved like the primary and before any money
 * moves. Any entry that does not resolve (foreign connection, missing one,
 * off-list model, empty model) refuses the whole run with ONE answer, so the
 * response never tells which entry or why (devil C254, C255). A platform
 * entry never falls to the default model: its name must be non-blank.
 * A platform entry labelled may-train is refused with its own code,
 * `fallback_may_train` (FA23): that label is public, so it leaks nothing.
 */
export async function resolveFallbacks(
	ctx: RouteContext,
	user: AuthUser,
	body: { connectionId?: string; model?: string; fallbacks?: readonly { connectionId?: string; model: string }[] },
): Promise<{ kind: 'ok'; targets: ResolvedTarget[] } | { kind: 'refused'; code: 'invalid_fallback' | 'fallback_may_train' }> {
	const seen = new Set([chainKey(body.connectionId, body.model)]);
	const targets: ResolvedTarget[] = [];
	for (const entry of body.fallbacks ?? []) {
		if (entry.model.trim() === '') return { kind: 'refused', code: 'invalid_fallback' };
		const key = chainKey(entry.connectionId, entry.model);
		if (seen.has(key)) continue;
		seen.add(key);
		const resolved = await resolveTarget(ctx.deps.db, ctx.deps.redis, user, entry.connectionId, entry.model);
		if (resolved.kind === 'refused') return { kind: 'refused', code: 'invalid_fallback' };
		// FA23: a prompt sent to a training provider cannot be recalled. A user's own provider is theirs to judge.
		if (resolved.target.platformBudget && resolved.target.dataUse === 'may-train') {
			return { kind: 'refused', code: 'fallback_may_train' };
		}
		targets.push(resolved.target);
	}
	return { kind: 'ok', targets };
}

function chainKey(connectionId: string | undefined, model: string | undefined): string {
	return JSON.stringify([(connectionId ?? '').trim(), (model ?? '').trim()]);
}

import type { Redis } from 'ioredis';
import type { CatalogEntry, PlatformCatalog } from '../gateway/catalog.ts';
import { PLATFORM_CONNECTION_ID } from '../connections/service.ts';
import { restingUntil } from './cooldown.ts';

/**
 * The Auto chain, resolved on the server (FA11): the best-ranked model, then
 * the best of each OTHER provider, then the same providers' next models
 * (FA12, so an OpenRouter-only config still gives 3). A may-train entry is
 * never picked (FA23) and a resting one is skipped.
 *
 * Caveat: `rank` is a static operator number, not live health; a model that
 * is slow but not failing keeps its place until the rest filter sees a
 * failure. Every entry resting returns an empty chain: the caller then runs
 * as it did before Auto existed.
 */
export function autoChain(
	catalog: PlatformCatalog,
	resting: (menuId: string) => boolean,
	size = 3,
): CatalogEntry[] {
	// Ties go to the catalog default (R13: a legacy-only config is all unranked), then list order (Array#sort is stable).
	const usable = catalog.entries
		.filter((entry) => entry.dataUse === 'no-train' && !resting(entry.menuId))
		.sort((a, b) => a.rank - b.rank || Number(b.menuId === catalog.defaultId) - Number(a.menuId === catalog.defaultId));
	const chain: CatalogEntry[] = [];
	const seen = new Set<string>();
	for (const entry of usable) {
		if (seen.has(entry.providerId)) continue;
		seen.add(entry.providerId);
		chain.push(entry);
	}
	const firstPerProvider = new Set(chain);
	const rest = usable.filter((entry) => !firstPerProvider.has(entry));
	return [...chain, ...rest].slice(0, size);
}

/** True when the request names no platform model the catalog serves, so Auto picks one. */
export function wantsAuto(catalog: PlatformCatalog, connectionId: string | undefined, model: string | undefined): boolean {
	if ((connectionId ?? '').trim() !== '' && (connectionId ?? '').trim() !== PLATFORM_CONNECTION_ID) return false;
	const asked = (model ?? '').trim();
	return asked === '' || !catalog.entries.some((entry) => entry.menuId === asked);
}

/** The Auto chain for a user: ONE batched read of the rests (the same MGET the runner uses), then the pure pick. */
export async function autoChainFor(redis: Redis, userId: string, catalog: PlatformCatalog): Promise<CatalogEntry[]> {
	const until = await restingUntil(
		redis,
		userId,
		catalog.entries.map((entry) => ({ connectionId: PLATFORM_CONNECTION_ID, model: entry.menuId, platform: true })),
	);
	const resting = new Set(catalog.entries.filter((_, index) => until[index] !== undefined).map((entry) => entry.menuId));
	return autoChain(catalog, (menuId) => resting.has(menuId));
}

/**
 * The body of a run with Auto applied (FA11): when the request names no usable
 * platform model and carries no fallbacks of its own (an empty list is none), the chain's head becomes
 * the model and the rest the fallbacks. `restFiltered` tells the runner the
 * chain already skipped what rests, so it does not read the rests again. An
 * empty chain returns the body untouched and the run answers as before.
 */
export async function withAuto<T extends { connectionId?: string; model?: string; fallbacks?: readonly unknown[] }>(
	redis: Redis,
	userId: string,
	catalog: PlatformCatalog,
	parsed: T,
): Promise<{ body: T; restFiltered: boolean }> {
	if (parsed.fallbacks?.length || !wantsAuto(catalog, parsed.connectionId, parsed.model)) return { body: parsed, restFiltered: false };
	const chain = await autoChainFor(redis, userId, catalog);
	if (chain.length === 0) return { body: parsed, restFiltered: false };
	const fallbacks = chain.slice(1).map((entry) => ({ model: entry.menuId }));
	return { body: { ...parsed, model: chain[0].menuId, fallbacks }, restFiltered: true };
}

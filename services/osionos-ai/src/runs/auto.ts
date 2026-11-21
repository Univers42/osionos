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
	// Array#sort is stable: unranked entries keep their list order.
	const usable = catalog.entries
		.filter((entry) => entry.dataUse === 'no-train' && !resting(entry.menuId))
		.sort((a, b) => a.rank - b.rank);
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

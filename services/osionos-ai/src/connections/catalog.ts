import { z } from 'zod';
import type { Redis } from 'ioredis';
import { config } from '../config.ts';
import { guardedFetch } from './endpointGuard.ts';
import {
	ENDPOINT_PROVIDER,
	defaultBaseUrl,
	findProvider,
	kindOf,
	providers,
	wireFromNpm,
} from './providers.ts';
import type { ProviderEntry } from './providers.ts';
import { parseCatalog, toProvider } from './catalogParse.ts';
import type { CatalogModel, CatalogProvider } from './catalogParse.ts';

/**
 * The catalog of models.dev: the market's providers and their models.
 *
 * The catalog is third-party data, refreshed once a day. Caveat: its prices and
 * limits can lag the provider by up to a day, so the catalog is a convenience —
 * a name to show and a price to hint at. The billing of a user's own connection
 * never relies on it: their provider bills them, and we only book our own
 * spend on the platform connection.
 *
 * The copy lives in memory and in Redis (`ai:catalog:v1`, a day), so the
 * replicas share one fetch and a broken catalog never reaches the picker.
 */

/** The key of the shared copy of the catalog. */
export const CATALOG_KEY = 'ai:catalog:v1';

/** The life of the copy: a day. */
export const CATALOG_TTL_SECONDS = 86_400;

/** The timeout of the fetch of the catalog. */
const CATALOG_TIMEOUT_MS = 10_000;

/**
 * How long a failed attempt is remembered: a catalog that cannot be reached is
 * not hammered, and the last good copy is served in the meantime.
 */
const CATALOG_RETRY_MS = 600_000;

/** The cap of the providers kept. */
const MAX_PROVIDERS = 500;

export type { CatalogModel, CatalogProvider };

/** The copy of the catalog this process holds. */
interface CatalogCopy {
	providers: CatalogProvider[];
	expiresAt: number;
}

let copy: CatalogCopy | null = null;

/**
 * The fetch of the catalog, when one is in flight.
 *
 * Only one fetch runs at a time: the requests that arrive while it runs share
 * it instead of starting their own.
 */
let inFlight: Promise<CatalogProvider[]> | null = null;

/** The fetch of the catalog: the URL of the deployment, with a timeout. */
async function fetchCatalog(): Promise<CatalogProvider[] | null> {
	try {
		const response = await guardedFetch(config.catalogUrl, {}, CATALOG_TIMEOUT_MS);
		if (!response.ok) return null;
		return parseCatalog(await response.json());
	} catch {
		return null;
	}
}

/** The shared copy of the catalog, read from Redis. */
async function readShared(redis: Redis): Promise<CatalogProvider[] | null> {
	let raw: string | null = null;
	try {
		raw = await redis.get(CATALOG_KEY);
	} catch {
		return null;
	}
	if (!raw) return null;
	try {
		const parsed = z.array(z.unknown()).safeParse(JSON.parse(raw));
		if (!parsed.success) return null;
		const found = parsed.data
			.map((entry) => toProvider(entry))
			.filter((entry): entry is CatalogProvider => entry !== null);
		return found.length > 0 ? found : null;
	} catch {
		return null;
	}
}

/** The shared copy of the catalog, written to Redis. */
async function writeShared(redis: Redis, found: CatalogProvider[]): Promise<void> {
	try {
		await redis.set(CATALOG_KEY, JSON.stringify(found), 'EX', CATALOG_TTL_SECONDS);
	} catch {
		// The cache is a convenience: a Redis that refuses the copy is not a failure.
	}
}

/**
 * The catalog, once.
 *
 * The copy in memory comes first, then the one of Redis (another replica may
 * have fetched it already), and only then the URL of the deployment.
 */
async function loadOnce(redis: Redis): Promise<CatalogProvider[]> {
	const shared = await readShared(redis);
	if (shared) {
		copy = { providers: shared, expiresAt: Date.now() + CATALOG_TTL_SECONDS };
		return shared;
	}
	const fetched = await fetchCatalog();
	if (fetched) {
		if (fetched.length > MAX_PROVIDERS) {
			console.warn(JSON.stringify({ event: 'catalog_capped', providers: fetched.length, kept: MAX_PROVIDERS }));
			fetched.length = MAX_PROVIDERS;
		}
		copy = { providers: fetched, expiresAt: Date.now() + CATALOG_TTL_SECONDS };
		await writeShared(redis, fetched);
		return fetched;
	}
	// The fetch failed: the last good copy is kept, and the built-in list is
	// the fallback when there is none.
	const lastGood = copy?.providers ?? [];
	copy = { providers: lastGood, expiresAt: Date.now() + CATALOG_RETRY_MS };
	return lastGood;
}

/** The catalog of this process: the copy in memory, or a fresh one. */
export async function catalog(redis: Redis): Promise<CatalogProvider[]> {
	if (copy && copy.expiresAt > Date.now()) return copy.providers;
	if (!inFlight) {
		inFlight = loadOnce(redis).finally(() => {
			inFlight = null;
		});
	}
	return inFlight;
}

/**
 * One provider of the catalog and the built-in list, merged.
 *
 * The built-in list wins on the base URL and on the wire: those are the ones
 * the tests know. The catalog wins on the name, on the documentation and on
 * the models.
 */
function mergeProvider(entry: CatalogProvider, builtin: ProviderEntry | null): ProviderEntry {
	const wire = builtin?.wire ?? wireFromNpm(entry.npm);
	const baseUrl = builtin?.baseUrl ?? entry.api ?? (wire ? defaultBaseUrl(entry.npm, wire) : '');
	const docUrl = entry.doc ?? builtin?.docUrl;
	return {
		id: entry.id,
		name: entry.name,
		kind: kindOf(entry.id),
		// A provider that speaks the OpenAI wire and points nowhere cannot be
		// called: it is in the list, but it cannot be connected.
		supported: wire !== null && (wire !== 'openai-compatible' || baseUrl.length > 0),
		...(docUrl ? { docUrl } : {}),
		baseUrl,
		wire,
		modelCount: entry.models.length,
	};
}

/**
 * The providers the service knows: the catalog, the built-ins it does not
 * cover, and the entry of the user's own endpoint.
 */
export async function providerEntries(redis: Redis): Promise<ProviderEntry[]> {
	const found = await catalog(redis);
	const entries: ProviderEntry[] = [];
	const seen = new Set<string>();
	for (const entry of found) {
		entries.push(mergeProvider(entry, findProvider(entry.id)));
		seen.add(entry.id);
	}
	for (const builtin of providers()) {
		if (seen.has(builtin.id)) continue;
		entries.push(builtin);
	}
	entries.push(ENDPOINT_PROVIDER);
	entries.sort((left, right) => left.name.localeCompare(right.name));
	return entries;
}

/** One provider of the list, or null when it is not in it. */
export async function providerEntry(redis: Redis, id: string): Promise<ProviderEntry | null> {
	const found = await catalog(redis);
	const entry = found.find((provider) => provider.id === id);
	if (entry) return mergeProvider(entry, findProvider(id));
	return findProvider(id);
}

/** The models of the catalog for a provider: none when it is not in it. */
export async function providerModels(redis: Redis, id: string): Promise<CatalogModel[]> {
	const found = await catalog(redis);
	return found.find((provider) => provider.id === id)?.models ?? [];
}

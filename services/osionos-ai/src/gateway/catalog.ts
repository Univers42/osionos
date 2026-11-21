import type { DataUse, PlatformModelEntry } from '../platformModels.ts';
import type { PlatformProvider, Wire } from '../platformProviders.ts';

/** The env var each side of the union is read from; a refusal names it, never a value. */
const LEGACY_VAR = 'OSIONOS_AI_PLATFORM_MODELS';
const POOL_VAR = 'OSIONOS_AI_PLATFORM_PROVIDERS';

export interface CatalogEntry {
	menuId: string;
	upstreamId: string;
	/** 'legacy' for OSIONOS_AI_PLATFORM_MODELS. */
	providerId: string;
	wire: Wire;
	dataUse: DataUse;
	rank: number;
	pricing: PlatformModelEntry;
}

export interface PlatformCatalog {
	entries: readonly CatalogEntry[];
	providers: readonly PlatformProvider[];
	defaultId: string;
}

export interface CatalogEnv {
	publicMode: boolean;
	keyOf: (name: string) => string | undefined;
	log: (line: string) => void;
}

interface Tagged {
	entry: CatalogEntry;
	source: string;
}

/** Unknown is may-train (FA24): only the exact string 'no-train' earns the stronger label. */
function dataUseOf(value: unknown): DataUse {
	return value === 'no-train' ? 'no-train' : 'may-train';
}

/** Caveat: matches the host by name only, so a proxy in front of openrouter.ai is still 'openai-compatible'. */
function legacyWire(baseUrl: string): Wire {
	try {
		return new URL(baseUrl).hostname === 'openrouter.ai' ? 'openrouter' : 'openai-compatible';
	} catch {
		return 'openai-compatible';
	}
}

function legacyEntries(legacy: readonly PlatformModelEntry[], baseUrl: string): Tagged[] {
	const wire = legacyWire(baseUrl);
	return legacy.map((model) => ({
		source: LEGACY_VAR,
		entry: { menuId: model.id, upstreamId: model.id, providerId: 'legacy', wire, dataUse: dataUseOf(model.dataUse), rank: Number.MAX_SAFE_INTEGER, pricing: model },
	}));
}

/** A provider whose key env is named but unset or empty is dropped; the log carries ids and names only (FA6). */
function liveProviders(providers: readonly PlatformProvider[], env: CatalogEnv): PlatformProvider[] {
	return providers.filter((provider) => {
		if (provider.apiKeyEnv === undefined || (env.keyOf(provider.apiKeyEnv) ?? '') !== '') return true;
		env.log(`[osionos-ai] provider ${provider.id} dropped: ${provider.apiKeyEnv} is unset`);
		return false;
	});
}

function poolEntries(provider: PlatformProvider): Tagged[] {
	return provider.models.map((model) => ({
		source: POOL_VAR,
		entry: { menuId: model.id, upstreamId: model.upstreamId, providerId: provider.id, wire: provider.wire, dataUse: dataUseOf(model.dataUse), rank: model.rank ?? Number.MAX_SAFE_INTEGER, pricing: model },
	}));
}

function duplicateSource(tagged: readonly Tagged[]): string | null {
	const seen = new Set<string>();
	for (const { entry, source } of tagged) {
		if (seen.has(entry.menuId)) return source;
		seen.add(entry.menuId);
	}
	return null;
}

function pricedSource(tagged: readonly Tagged[]): string | null {
	const priced = tagged.find(({ entry }) => entry.pricing.inputMicroUsdPerMTok !== 0 || entry.pricing.outputMicroUsdPerMTok !== 0);
	return priced?.source ?? null;
}

/**
 * The boot catalog: the legacy allowlist and the live pool as one menu.
 *
 * Refuses with the name of the env var at fault (FA1 duplicate ids or default
 * count, FA8 a price in public mode, FA23 a may-train default). Sorted by rank,
 * unranked last in list order. The default is counted after dropped providers
 * leave, so a default whose key is missing refuses instead of vanishing.
 */
export function buildCatalog(
	legacy: readonly PlatformModelEntry[],
	providers: readonly PlatformProvider[],
	env: CatalogEnv,
	legacyBaseUrl = '',
): PlatformCatalog | { refused: string } {
	const live = liveProviders(providers, env);
	const tagged = [...legacyEntries(legacy, legacyBaseUrl), ...live.flatMap(poolEntries)];
	const duplicate = duplicateSource(tagged);
	if (duplicate !== null) return { refused: duplicate };
	if (env.publicMode) {
		const priced = pricedSource(tagged);
		if (priced !== null) return { refused: priced };
	}
	const defaults = tagged.filter(({ entry }) => entry.pricing.default);
	if (defaults.length !== 1) return { refused: defaults[1]?.source ?? LEGACY_VAR };
	if (defaults[0].entry.dataUse !== 'no-train') return { refused: defaults[0].source };
	const entries = tagged
		.map(({ entry }, index) => ({ entry, index }))
		.sort((a, b) => a.entry.rank - b.entry.rank || a.index - b.index)
		.map(({ entry }) => entry);
	return { entries, providers: live, defaultId: defaults[0].entry.menuId };
}

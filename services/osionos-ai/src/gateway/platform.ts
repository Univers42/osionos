import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { config } from '../config.ts';
import type { PlatformModelEntry } from '../config.ts';
import type { CatalogEntry } from './catalog.ts';
import type { PlatformProvider } from '../platformProviders.ts';

export type { PlatformModelEntry };

/** The usage of a call, in tokens. Anything missing counts as zero. */
export interface ModelUsage {
	inputTokens?: number;
	outputTokens?: number;
}

/**
 * The legacy upstream of the platform: ONE OpenAI-compatible handle, reached
 * through the Vercel AI SDK. It is built once per process: the headers and the
 * base URL never change.
 *
 * The two extra headers are the ones OpenRouter asks for, sent only on the
 * openrouter wire (FA5); they name the allowed origin, never a secret.
 *
 * includeUsage sends `stream_options: { include_usage: true }` with the call:
 * an OpenAI-compatible upstream reports the tokens of a stream only when it
 * is asked to, and without the answer the budget settles nothing.
 */
let provider: ReturnType<typeof createOpenAICompatible> | undefined;

/** FA5: the OpenRouter headers go only where the catalog says the legacy upstream is OpenRouter. */
function legacyIsOpenRouter(): boolean {
	return config.catalog.entries.some((entry) => entry.providerId === 'legacy' && entry.wire === 'openrouter');
}

function platformProvider(): ReturnType<typeof createOpenAICompatible> {
	if (!provider) {
		provider = createOpenAICompatible({
			name: 'platform',
			baseURL: config.upstreamBaseUrl,
			...(config.upstreamApiKey ? { apiKey: config.upstreamApiKey } : {}),
			...(legacyIsOpenRouter() ? { headers: { 'HTTP-Referer': config.allowedOrigin, 'X-Title': 'osionos' } } : {}),
			includeUsage: true,
		});
	}
	return provider;
}

/**
 * One handle per pooled provider, built on first use and cached by provider id
 * (FA5): its own base URL and its own key, read from the env at that moment and
 * never logged. The OpenRouter headers go on the openrouter wire only; the
 * handle's name is the key its provider options are read under.
 */
const poolHandles = new Map<string, ReturnType<typeof createOpenAICompatible>>();

function poolProvider(entry: PlatformProvider): ReturnType<typeof createOpenAICompatible> {
	let handle = poolHandles.get(entry.id);
	if (!handle) {
		const apiKey = entry.apiKeyEnv ? process.env[entry.apiKeyEnv]?.trim() : undefined;
		handle = createOpenAICompatible({
			name: entry.id,
			baseURL: entry.baseUrl,
			...(apiKey ? { apiKey } : {}),
			...(entry.wire === 'openrouter' ? { headers: { 'HTTP-Referer': config.allowedOrigin, 'X-Title': 'osionos' } } : {}),
			includeUsage: true,
		});
		poolHandles.set(entry.id, handle);
	}
	return handle;
}

/** The catalog entry of a menu id, or undefined when the platform does not serve it. */
export function catalogEntry(menuId: string): CatalogEntry | undefined {
	return config.catalog.entries.find((entry) => entry.menuId === menuId);
}

/** The key the provider options of an entry are read under: the name of its handle. */
export function platformOptionsKey(entry: CatalogEntry): string {
	return entry.providerId === 'legacy' ? 'platform' : entry.providerId;
}

/**
 * The upstream model handle of a menu id. The upstream is asked for the
 * entry's `upstreamId`; an id the catalog does not know goes to the legacy
 * handle as it always did.
 */
export function platformModel(menuId: string): LanguageModel {
	const entry = catalogEntry(menuId);
	const pooled = entry && config.catalog.providers.find((one) => one.id === entry.providerId);
	if (!entry || !pooled) return platformProvider()(entry?.upstreamId ?? menuId);
	return poolProvider(pooled)(entry.upstreamId);
}

/** The menu: every model the catalog serves, legacy and pooled. */
export function platformModels(): readonly PlatformModelEntry[] {
	return config.catalog.entries.map((entry) => entry.pricing);
}

/** The default model of the allowlist: the one a run gets when it asks for none. */
export function defaultModel(): PlatformModelEntry | null {
	return config.platformModels.find((model) => model.default) ?? null;
}

/**
 * The catalog entry a request asks for, or null when it asks for a model the
 * platform does not serve. An empty request means the default model.
 */
export function resolveModel(requested?: string): CatalogEntry | null {
	const asked = requested?.trim();
	return catalogEntry(asked || config.catalog.defaultId) ?? null;
}

/**
 * The cost of a call, in micro-USD, rounded up: a call never costs less than the
 * fraction of a micro-USD it uses.
 */
export function costMicroUsd(entry: PlatformModelEntry, usage: ModelUsage): number {
	const inputTokens = usage.inputTokens ?? 0;
	const outputTokens = usage.outputTokens ?? 0;
	const microUsd =
		(inputTokens * entry.inputMicroUsdPerMTok) / 1e6 + (outputTokens * entry.outputMicroUsdPerMTok) / 1e6;
	return Math.ceil(microUsd);
}

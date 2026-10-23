import { config } from '../config.ts';

/**
 * The providers the service knows: the built-in list, and the catalog of
 * models.dev that lands on top of it.
 *
 * The built-in list is the fallback: it is what the service answers when the
 * catalog is out of reach, so the picker never shows an empty list. Its base
 * URLs win over the ones of the catalog: they are the ones the tests know.
 */

/** The wire format the server speaks with a provider. */
export type WireFormat = 'openai-compatible' | 'anthropic' | 'google';

/** The id of the provider the user signs in with. */
export const OPENROUTER_ID = 'openrouter';

/** The id of the entry of the user's own endpoint. */
export const ENDPOINT_ID = 'endpoint';

/** A provider of the catalog, as the client sees it. */
export interface Provider {
	id: string;
	name: string;
	kind: 'api_key' | 'oauth' | 'endpoint';
	supported: boolean;
	docUrl?: string;
	modelCount: number;
}

/** A provider of the catalog, as the server keeps it. */
export interface ProviderEntry {
	id: string;
	name: string;
	kind: 'api_key' | 'oauth' | 'endpoint';
	supported: boolean;
	docUrl?: string;
	/** The base URL of the provider's API. */
	baseUrl: string;
	/**
	 * The wire format of the provider: the adapter that speaks it.
	 *
	 * It is null when the catalog names an SDK the service has no adapter for:
	 * the provider is in the list, but it cannot be connected.
	 */
	wire: WireFormat | null;
	/** The number of models the catalog holds for this provider. */
	modelCount: number;
}

/**
 * The base URL of a wire, for a provider that names none of its own.
 *
 * The OpenAI-compatible wire has none: a provider that speaks it and points
 * nowhere cannot be called.
 */
const WIRE_BASE_URL: Record<WireFormat, string | null> = {
	'openai-compatible': null,
	anthropic: 'https://api.anthropic.com/v1',
	google: 'https://generativelanguage.googleapis.com/v1beta',
};

/** The base URL of a wire, for a provider that names none of its own. */
export function wireBaseUrl(wire: WireFormat): string {
	return WIRE_BASE_URL[wire] ?? '';
}

/**
 * The base URL of a provider of the catalog, when it names none of its own.
 *
 * The OpenAI SDK means the OpenAI API: a provider that speaks it and points
 * nowhere is called at `api.openai.com`.
 */
export function defaultBaseUrl(npm: string | undefined | null, wire: WireFormat): string {
	if ((npm ?? '').trim() === '@ai-sdk/openai') return 'https://api.openai.com/v1';
	return wireBaseUrl(wire);
}

/**
 * The wire of a provider, from the npm package the catalog names.
 *
 * Only four SDKs are spoken: the OpenAI-compatible one, OpenAI's own, the
 * Anthropic one and the Google one. Every other package is a provider the
 * service cannot call yet.
 */
export function wireFromNpm(npm: string | undefined | null): WireFormat | null {
	switch ((npm ?? '').trim()) {
		case '@ai-sdk/openai-compatible':
		case '@ai-sdk/openai':
			return 'openai-compatible';
		case '@ai-sdk/anthropic':
			return 'anthropic';
		case '@ai-sdk/google':
			return 'google';
		default:
			return null;
	}
}

/** The kind of a provider: OpenRouter is the one the user signs in to. */
export function kindOf(id: string): ProviderEntry['kind'] {
	if (id === OPENROUTER_ID) return 'oauth';
	return 'api_key';
}

function provider(entry: ProviderEntry): ProviderEntry {
	return Object.freeze(entry);
}

/** The built-in list of the providers the service knows. */
const PROVIDERS: readonly ProviderEntry[] = Object.freeze([
	provider({
		id: OPENROUTER_ID,
		name: 'OpenRouter',
		kind: 'oauth',
		supported: true,
		docUrl: 'https://openrouter.ai/docs',
		baseUrl: 'https://openrouter.ai/api/v1',
		wire: 'openai-compatible',
		modelCount: 0,
	}),
	provider({
		id: 'opencode',
		name: 'OpenCode Zen',
		kind: 'api_key',
		supported: true,
		docUrl: 'https://opencode.ai/docs',
		baseUrl: 'https://opencode.ai/zen/v1',
		wire: 'openai-compatible',
		modelCount: 0,
	}),
	provider({
		id: 'openai',
		name: 'OpenAI',
		kind: 'api_key',
		supported: true,
		docUrl: 'https://platform.openai.com/docs',
		baseUrl: 'https://api.openai.com/v1',
		wire: 'openai-compatible',
		modelCount: 0,
	}),
	provider({
		id: 'groq',
		name: 'Groq',
		kind: 'api_key',
		supported: true,
		docUrl: 'https://console.groq.com/docs',
		baseUrl: 'https://api.groq.com/openai/v1',
		wire: 'openai-compatible',
		modelCount: 0,
	}),
	provider({
		id: 'deepseek',
		name: 'DeepSeek',
		kind: 'api_key',
		supported: true,
		docUrl: 'https://api-docs.deepseek.com',
		baseUrl: 'https://api.deepseek.com/v1',
		wire: 'openai-compatible',
		modelCount: 0,
	}),
	provider({
		id: 'mistral',
		name: 'Mistral',
		kind: 'api_key',
		supported: true,
		docUrl: 'https://docs.mistral.ai',
		baseUrl: 'https://api.mistral.ai/v1',
		wire: 'openai-compatible',
		modelCount: 0,
	}),
	provider({
		id: 'xai',
		name: 'xAI',
		kind: 'api_key',
		supported: true,
		docUrl: 'https://docs.x.ai',
		baseUrl: 'https://api.x.ai/v1',
		wire: 'openai-compatible',
		modelCount: 0,
	}),
	provider({
		id: 'anthropic',
		name: 'Anthropic',
		kind: 'api_key',
		supported: true,
		docUrl: 'https://docs.anthropic.com',
		baseUrl: 'https://api.anthropic.com/v1',
		wire: 'anthropic',
		modelCount: 0,
	}),
	provider({
		id: 'google',
		name: 'Google',
		kind: 'api_key',
		supported: true,
		docUrl: 'https://ai.google.dev/docs',
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
		wire: 'google',
		modelCount: 0,
	}),
]);

/**
 * The entry of the user's own endpoint: the local runtimes (Ollama, llama.cpp,
 * LM Studio, vLLM) reach us through a URL the server can call.
 */
export const ENDPOINT_PROVIDER: ProviderEntry = Object.freeze({
	id: ENDPOINT_ID,
	name: 'Your own endpoint',
	kind: 'endpoint',
	supported: true,
	baseUrl: '',
	wire: 'openai-compatible',
	modelCount: 0,
});

/** The built-in list, the fallback of the catalog. */
export function providers(): readonly ProviderEntry[] {
	return PROVIDERS;
}

/** One built-in provider, or null when it is not in the list. */
export function findProvider(id: string): ProviderEntry | null {
	return PROVIDERS.find((entry) => entry.id === id) ?? null;
}

/**
 * The base URL of a provider.
 *
 * The tests point a provider at their mock upstream; the override is a
 * development convenience and is empty in production.
 */
export function providerBaseUrl(entry: ProviderEntry): string {
	return config.devProviderBaseUrls[entry.id] ?? entry.baseUrl;
}

/** A provider of the list, in the shape the contract gives it. */
export function toContractProvider(entry: ProviderEntry): Provider {
	return {
		id: entry.id,
		name: entry.name,
		kind: entry.kind,
		supported: entry.supported,
		...(entry.docUrl ? { docUrl: entry.docUrl } : {}),
		modelCount: entry.modelCount,
	};
}

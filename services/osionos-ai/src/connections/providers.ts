import { config } from '../config.ts';

/**
 * The built-in providers: the small catalog the client shows.
 *
 * The catalog of models.dev lands in a later brief; until then the list is
 * frozen here, and `modelCount` is zero. A provider is `supported` when the
 * server has an adapter for its wire format: the OpenAI-compatible one is
 * here, the Anthropic and Google adapters come with their own brief.
 */

/** The wire format the server speaks with a provider. */
export type WireFormat = 'openai-compatible' | 'anthropic' | 'google';

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
	/** The wire format of the provider: the adapter that speaks it. */
	wire: WireFormat;
}

function provider(entry: ProviderEntry): ProviderEntry {
	return Object.freeze(entry);
}

/** The frozen list of the providers the service knows. */
const PROVIDERS: readonly ProviderEntry[] = Object.freeze([
	provider({
		id: 'openrouter',
		name: 'OpenRouter',
		kind: 'api_key',
		supported: true,
		docUrl: 'https://openrouter.ai/docs',
		baseUrl: 'https://openrouter.ai/api/v1',
		wire: 'openai-compatible',
	}),
	provider({
		id: 'opencode',
		name: 'OpenCode Zen',
		kind: 'api_key',
		supported: true,
		docUrl: 'https://opencode.ai/docs',
		baseUrl: 'https://opencode.ai/zen/v1',
		wire: 'openai-compatible',
	}),
	provider({
		id: 'openai',
		name: 'OpenAI',
		kind: 'api_key',
		supported: true,
		docUrl: 'https://platform.openai.com/docs',
		baseUrl: 'https://api.openai.com/v1',
		wire: 'openai-compatible',
	}),
	provider({
		id: 'groq',
		name: 'Groq',
		kind: 'api_key',
		supported: true,
		docUrl: 'https://console.groq.com/docs',
		baseUrl: 'https://api.groq.com/openai/v1',
		wire: 'openai-compatible',
	}),
	provider({
		id: 'deepseek',
		name: 'DeepSeek',
		kind: 'api_key',
		supported: true,
		docUrl: 'https://api-docs.deepseek.com',
		baseUrl: 'https://api.deepseek.com/v1',
		wire: 'openai-compatible',
	}),
	provider({
		id: 'mistral',
		name: 'Mistral',
		kind: 'api_key',
		supported: true,
		docUrl: 'https://docs.mistral.ai',
		baseUrl: 'https://api.mistral.ai/v1',
		wire: 'openai-compatible',
	}),
	provider({
		id: 'xai',
		name: 'xAI',
		kind: 'api_key',
		supported: true,
		docUrl: 'https://docs.x.ai',
		baseUrl: 'https://api.x.ai/v1',
		wire: 'openai-compatible',
	}),
	provider({
		id: 'anthropic',
		name: 'Anthropic',
		kind: 'api_key',
		supported: false,
		docUrl: 'https://docs.anthropic.com',
		baseUrl: 'https://api.anthropic.com/v1',
		wire: 'anthropic',
	}),
	provider({
		id: 'google',
		name: 'Google',
		kind: 'api_key',
		supported: false,
		docUrl: 'https://ai.google.dev/docs',
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
		wire: 'google',
	}),
]);

/** The catalog, as the client sees it. */
export function providers(): readonly ProviderEntry[] {
	return PROVIDERS;
}

/** One provider of the catalog, or null when it is not in it. */
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

/** A provider of the catalog, in the shape the contract gives it. */
export function toContractProvider(entry: ProviderEntry): Provider {
	return {
		id: entry.id,
		name: entry.name,
		kind: entry.kind,
		supported: entry.supported,
		...(entry.docUrl ? { docUrl: entry.docUrl } : {}),
		// The catalog of models.dev is not here yet: no model is counted.
		modelCount: 0,
	};
}

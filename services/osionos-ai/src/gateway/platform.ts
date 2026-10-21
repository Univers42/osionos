import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { config } from '../config.ts';
import type { PlatformModelEntry } from '../config.ts';

export type { PlatformModelEntry };

/** The usage of a call, in tokens. Anything missing counts as zero. */
export interface ModelUsage {
	inputTokens?: number;
	outputTokens?: number;
}

/**
 * The provider of the platform: ONE OpenAI-compatible upstream, reached through
 * the Vercel AI SDK. The handle is built once per process: the headers and the
 * base URL never change.
 *
 * The two extra headers are the ones OpenRouter asks for, and they name the
 * allowed origin of this deployment, never a secret.
 */
let provider: ReturnType<typeof createOpenAICompatible> | undefined;

function platformProvider(): ReturnType<typeof createOpenAICompatible> {
	if (!provider) {
		provider = createOpenAICompatible({
			name: 'platform',
			baseURL: config.upstreamBaseUrl,
			...(config.upstreamApiKey ? { apiKey: config.upstreamApiKey } : {}),
			headers: { 'HTTP-Referer': config.allowedOrigin, 'X-Title': 'osionos' },
		});
	}
	return provider;
}

/** The upstream model handle of an allowlist entry. */
export function platformModel(id: string): LanguageModel {
	return platformProvider()(id);
}

/** The allowlist, as configured. */
export function platformModels(): readonly PlatformModelEntry[] {
	return config.platformModels;
}

/** The default model of the allowlist: the one a run gets when it asks for none. */
export function defaultModel(): PlatformModelEntry | null {
	return config.platformModels.find((model) => model.default) ?? null;
}

/**
 * The allowlist entry a request asks for, or null when it asks for a model the
 * platform does not serve. An empty request means the default model.
 */
export function resolveModel(requested?: string): PlatformModelEntry | null {
	const asked = requested?.trim();
	if (!asked) return defaultModel();
	return config.platformModels.find((model) => model.id === asked) ?? null;
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

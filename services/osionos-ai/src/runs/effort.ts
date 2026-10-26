import { config } from '../config.ts';
import type { ResolvedTarget } from '../gateway/resolve.ts';

/**
 * The reasoning effort of a run, as the option each wire reads.
 *
 * The names come from the installed SDKs (@ai-sdk/openai-compatible 3.0.68
 * index.js:276 and :445, @ai-sdk/anthropic 4.0.79 index.js:920 and :3744,
 * @ai-sdk/google 4.0.95 index.js:795 and :1592). A run without an effort, or
 * on a model that does not reason, sends nothing: the request is the one of
 * before.
 *
 * Caveat: the token budgets are a mapping of three words to numbers, not a
 * measure of how hard a model thinks; a model that ignores the option
 * (an older one, a provider that drops unknown fields) answers the same at
 * every level.
 */

export type Effort = 'low' | 'medium' | 'high';

/** A fragment of the SDK's `providerOptions`: provider key → options. */
export type ProviderOptionsFragment = Record<string, Record<string, unknown>>;

const ANTHROPIC_BUDGET: Record<Effort, number> = { low: 1_024, medium: 4_096, high: 16_000 };
const GOOGLE_BUDGET: Record<Effort, number> = { low: 1_024, medium: 8_192, high: 24_576 };

/** Anthropic refuses a thinking budget under this many tokens. */
const ANTHROPIC_MIN_BUDGET = 1_024;

/** The options that make a reasoning model think at `effort`, or `{}`. */
export function reasoningOptions(
	target: Pick<ResolvedTarget, 'wire' | 'optionsKey' | 'reasoning' | 'platformBudget'>,
	effort: Effort | undefined,
	maxOutputTokens: number = config.maxOutputTokens,
): ProviderOptionsFragment {
	if (!effort || !target.reasoning) return {};
	switch (target.wire) {
		case 'anthropic': {
			// The thinking tokens come out of the answer's room: keep 1 024 for it.
			const budget = Math.min(ANTHROPIC_BUDGET[effort], maxOutputTokens - ANTHROPIC_MIN_BUDGET);
			if (budget < ANTHROPIC_MIN_BUDGET) return {};
			return { [target.optionsKey]: { thinking: { type: 'enabled', budgetTokens: budget } } };
		}
		case 'google':
			return { [target.optionsKey]: { thinkingConfig: { thinkingBudget: GOOGLE_BUDGET[effort] } } };
		default:
			// The platform is OpenRouter, which reads `reasoning: { effort }` in the
			// body; the adapter passes an unknown key through. Any other
			// OpenAI-compatible upstream reads `reasoning_effort`.
			return target.platformBudget
				? { [target.optionsKey]: { reasoning: { effort } } }
				: { [target.optionsKey]: { reasoningEffort: effort } };
	}
}

/**
 * Two fragments in one, merged one level down: the same provider key keeps
 * the fields of both (the vision data-collection deny and the effort).
 */
export function mergeProviderOptions(
	first: ProviderOptionsFragment,
	second: ProviderOptionsFragment,
): ProviderOptionsFragment {
	const merged: ProviderOptionsFragment = { ...first };
	for (const [key, value] of Object.entries(second)) {
		merged[key] = { ...merged[key], ...value };
	}
	return merged;
}

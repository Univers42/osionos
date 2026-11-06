import type { ResolvedTarget } from '../gateway/resolve.ts';
import { apiCallOf } from './failover.ts';

/**
 * Whose limit a failed call hit: the platform's OpenRouter account, whose free
 * quota every user shares, or the one provider that served the route.
 *
 * OpenRouter has no origin field on a 429 (docs: api-reference/errors, 2026-11-02).
 * Its limits page ties `X-RateLimit-*` to "a platform limit", so the headers
 * decide first. `provider_name`/`raw` come from public logs of upstream 429s,
 * not from the docs.
 *
 * Caveat: no live 429 was captured. If upstream 429s carry `X-RateLimit-*`, a
 * busy provider rests every free route for up to 300 s (over-resting, bounded
 * by the TTL). If a platform 429 names a provider, the run walks the chain
 * (under-resting: at most 2 rejected calls). A body over MAX_BODY or one that
 * does not parse is `ambiguous`, never "no marker". The id test takes
 * `openrouter/free` as shared on no documented ground: the docs define free as
 * an id ending in `:free`; the failure direction is a rest bounded by the TTL.
 */

export type QuotaKind = 'account' | 'provider' | 'ambiguous';

export interface QuotaSignal {
	kind: QuotaKind;
	status: number;
	/** Header NAMES only, for the log line. */
	headers: string[];
	/** The field of the body that named a provider. */
	marker?: string;
}

const MAX_BODY = 4096;
const PROVIDER_MARKERS = ['provider_name', 'provider_code', 'raw'] as const;

export function isFreeTierModel(modelId: string): boolean {
	return modelId.endsWith(':free') || modelId === 'openrouter/free';
}

/** Only the platform's key spends the shared quota: a user's connection is the user's. */
export function spendsSharedQuota(target: Pick<ResolvedTarget, 'modelId' | 'platformBudget'>): boolean {
	return target.platformBudget && isFreeTierModel(target.modelId);
}

function metadataOf(body: string | undefined): Record<string, unknown> | undefined {
	if (!body || body.length > MAX_BODY) return undefined;
	try {
		const parsed = JSON.parse(body) as { error?: { metadata?: Record<string, unknown> } } | null;
		return parsed?.error?.metadata ?? {};
	} catch {
		return undefined;
	}
}

/** The reading of a 402 or a 429; null for any other failure. */
export function quotaSignal(error: unknown): QuotaSignal | null {
	const call = apiCallOf(error);
	if (call?.statusCode !== 402 && call?.statusCode !== 429) return null;
	const status = call.statusCode;
	if (status === 402) return { kind: 'account', status, headers: [] };
	const headers = Object.keys(call.responseHeaders ?? {})
		.map((name) => name.toLowerCase())
		.filter((name) => name.startsWith('x-ratelimit-'));
	if (headers.length > 0) return { kind: 'account', status, headers };
	const metadata = metadataOf(call.responseBody);
	if (!metadata) return { kind: 'ambiguous', status, headers };
	const marker = PROVIDER_MARKERS.find((field) => metadata[field] !== undefined);
	if (marker) return { kind: 'provider', status, headers, marker };
	return { kind: metadata.error_type === 'rate_limit_exceeded' ? 'account' : 'ambiguous', status, headers };
}

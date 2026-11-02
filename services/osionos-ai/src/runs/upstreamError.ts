import { StreamProviderError } from 'ai';
import { apiCallOf, classifyFailure, isOwnFailure } from './failover.ts';
import { headerOf, MAX_REST_SECONDS, resetSeconds, retryAfterSeconds } from './cooldown.ts';

/**
 * What a provider failure is called: a closed set of codes for the browser,
 * and the status and the type of the provider for the row of the run.
 *
 * The words of a provider are read here and go no further: they pick a code,
 * and the code is the only thing that leaves. Failing over is another decision
 * (src/runs/failover.ts); this one moves no run and no money.
 *
 * Caveat: the daily cap, the context window and `metadata.error_type` are read
 * from free text and a provider-specific body whose shapes were not checked
 * against a live OpenRouter or llama.cpp. A provider that words them otherwise
 * reads as `rate_limited` or `upstream_error` (today's vague answer). A rate
 * limit whose text happens to say "daily" reads as `quota_exhausted`. A label
 * is all that can be wrong. Widen the patterns with a row in
 * tests/upstreamError.test.ts.
 */

export type UpstreamCode = 'rate_limited' | 'quota_exhausted' | 'provider_unavailable' | 'context_too_long' | 'upstream_error';

export type UpstreamFailure = (
	| { code: 'rate_limited'; status: 429; retryAfterSeconds?: number }
	| { code: Exclude<UpstreamCode, 'rate_limited'>; status?: number; retryAfterSeconds?: undefined }
) & { errorType?: string };

/** A connection's upstream is whoever the user pointed it at: its text is hostile input. */
const MAX_PROVIDER_TEXT = 4096;
const DAILY_CAP = /per[-_ ]day|daily/i;
const CONTEXT_WINDOW = /context[-_ ](?:length|window|size)|maximum context|prompt is too long|n_ctx/i;
/** No `:`: it separates the parts of `ai_runs.error`. */
const ERROR_TYPE = /^[A-Za-z0-9_.-]{1,64}$/;

interface ProviderReport {
	status?: number;
	text: string;
	body?: string;
	headers?: Record<string, string>;
}

function httpStatus(status: number | undefined): number | undefined {
	return status !== undefined && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
}

function bounded(...parts: unknown[]): string {
	return parts
		.filter((part): part is string => typeof part === 'string')
		.map((part) => part.slice(0, MAX_PROVIDER_TEXT))
		.join('\n');
}

/**
 * What the provider said, from either shape: an APICallError, or the
 * StreamProviderError the SDK wraps the error of a 200 stream in.
 */
function providerReport(error: unknown): ProviderReport | undefined {
	const call = apiCallOf(error);
	if (call) {
		return {
			status: call.statusCode,
			text: bounded(call.message, call.responseBody),
			body: call.responseBody,
			headers: call.responseHeaders,
		};
	}
	if (!StreamProviderError.isInstance(error)) return undefined;
	return { status: httpStatus(error.statusCode), text: bounded(error.message, error.type, error.code) };
}

/** `error.metadata.error_type`: zod strips it from the SDK's `data`, so the raw body is the only place it is. */
function providerErrorType(body: string | undefined): string | undefined {
	if (!body || body.length > MAX_PROVIDER_TEXT) return undefined;
	try {
		const parsed = JSON.parse(body) as { error?: { metadata?: { error_type?: unknown } } } | null;
		const type = parsed?.error?.metadata?.error_type;
		return typeof type === 'string' && ERROR_TYPE.test(type) ? type : undefined;
	} catch {
		return undefined;
	}
}

function classOf(status: number, report: ProviderReport, nowMs: number): UpstreamFailure {
	if (status === 402) return { code: 'quota_exhausted', status };
	if (status === 429) {
		if (DAILY_CAP.test(report.text)) return { code: 'quota_exhausted', status };
		// A reset past the longest rest is the day's cap, whatever the text says:
		// the frame must not promise seconds a retry would not get.
		const asked = retryAfterSeconds(headerOf(report.headers, 'retry-after'), nowMs);
		const reset = resetSeconds(headerOf(report.headers, 'x-ratelimit-reset'), nowMs);
		if (asked === undefined && reset !== undefined && reset > MAX_REST_SECONDS) return { code: 'quota_exhausted', status };
		return { code: 'rate_limited', status, ...(asked === undefined && reset === undefined ? {} : { retryAfterSeconds: Math.min(asked ?? reset ?? 0, MAX_REST_SECONDS) }) };
	}
	if (status >= 500) return { code: 'provider_unavailable', status };
	if (status === 400 && CONTEXT_WINDOW.test(report.text)) return { code: 'context_too_long', status };
	return { code: 'upstream_error', status };
}

export function classifyUpstreamError(error: unknown, nowMs = Date.now()): UpstreamFailure {
	if (isOwnFailure(error)) return { code: 'upstream_error' };
	const report = providerReport(error);
	if (report?.status === undefined) {
		return { code: classifyFailure(error)?.reason === 'unavailable' ? 'provider_unavailable' : 'upstream_error' };
	}
	const errorType = providerErrorType(report.body);
	return { ...classOf(report.status, report, nowMs), ...(errorType ? { errorType } : {}) };
}

/**
 * The class of what ended a run. The whole run sits in one `try`: only the
 * error of the attempt is the provider's, because a refused socket of OUR
 * database wears the same `ECONNREFUSED`, and an attempt that was replaced
 * says nothing about a failure that came after it.
 */
export function classifyRunFailure(error: unknown, attemptError: unknown): UpstreamFailure {
	return error === attemptError ? classifyUpstreamError(error) : { code: 'upstream_error' };
}

/** The `error` frame: a closed code, and the seconds a rate limit asked for. */
export function errorFrame(failure: { code: string; retryAfterSeconds?: number }): { code: string; retryAfterSeconds?: number } {
	return { code: failure.code, ...(failure.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: failure.retryAfterSeconds }) };
}

/**
 * `ai_runs.error`: `code[:status[:type]]`. A provider's `rate_limited` always
 * has its status, so it never equals the bare preflight key that refuses the
 * re-POST of a run (src/runs/runner.ts): that run re-attaches, as it always did.
 */
export function storedError(failure: { code: string; status?: number; errorType?: string }): string {
	return [failure.code, failure.status, failure.errorType].filter((part) => part !== undefined).join(':');
}

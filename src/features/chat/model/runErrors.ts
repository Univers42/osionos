/**
 * The text of a run's failure, and when it may be retried.
 *
 * Pure: a code and a set of headers go in, a message and a retry delay come
 * out. Nothing here touches the store, the network or the clock.
 */

export interface RunErrorInfo {
	/** The message the notice shows. */
	text: string;
	/** Seconds to wait before a retry, when the failure is a 429. */
	retryAfter: number | null;
	/** Whether a Retry button makes sense. */
	retry: boolean;
}

function headerValue(headers: unknown, name: string): string | null {
	if (!headers) return null;
	const lower = name.toLowerCase();
	if (typeof (headers as { get?: unknown }).get === "function") {
		const value = (headers as { get: (n: string) => unknown }).get(name);
		return typeof value === "string" ? value : null;
	}
	if (typeof headers === "object") {
		const record = headers as Record<string, unknown>;
		for (const key of Object.keys(record)) {
			if (key.toLowerCase() === lower) {
				const value = record[key];
				return typeof value === "string" ? value : value == null ? null : String(value);
			}
		}
	}
	return null;
}

/** Parse a `Retry-After` header into whole seconds. */
export function parseRetryAfter(headers: unknown): number | null {
	const raw = headerValue(headers, "retry-after");
	if (raw == null) return null;
	const asNumber = Number(raw.trim());
	if (Number.isFinite(asNumber) && asNumber >= 0) return Math.ceil(asNumber);
	const date = Date.parse(raw);
	if (Number.isFinite(date)) {
		const seconds = Math.ceil((date - Date.now()) / 1000);
		return seconds >= 0 ? seconds : 0;
	}
	return null;
}

const MESSAGES: Record<string, (retryAfter: number | null) => string> = {
	rate_limited: (retryAfter) =>
		`Too many requests — try again in ${retryAfter ?? 60} s`,
	budget_exhausted: () => "Today's AI budget is used up",
	model_no_vision: () => "This model cannot see images",
	vision_unavailable: () => "Vision is unavailable for this model",
	attachment_not_found: () => "An attachment could not be found",
	upstream_unavailable: () => "The AI service is unavailable — try again",
	upstream_error: () => "The AI service failed — try again",
	network_error: () => "Connection lost — resuming",
	cancelled: () => "The run was cancelled",
};

export function runError(code: string, headers?: unknown): RunErrorInfo {
	const retryAfter = code === "rate_limited" ? parseRetryAfter(headers) : null;
	const factory = MESSAGES[code] ?? (() => "Something went wrong");
	return {
		text: factory(retryAfter),
		retryAfter,
		retry: code === "rate_limited" || code === "upstream_unavailable" || code === "upstream_error" || code === "network_error",
	};
}

export function runErrorInfo(code: string, headers?: unknown): RunErrorInfo {
	return runError(code, headers);
}

export function describeRunError(code: string, headers?: unknown): RunErrorInfo {
	return runError(code, headers);
}

export function runErrors(code: string, headers?: unknown): RunErrorInfo {
	return runError(code, headers);
}

export const RUN_ERRORS = MESSAGES;

export default runError;
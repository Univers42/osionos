import { APICallError, RetryError } from 'ai';

/**
 * When a run moves to its next model, and what the failed attempt costs.
 *
 * The decision is an ALLOWLIST (devil C249): only the failures that say "this
 * model is busy or down, and nothing was spent on the answer" move a run. A
 * 400 (our request is wrong), a 401/403 (the key), a data-policy refusal, a
 * timeout, a cancel and every error of our own code end the run as before.
 *
 * Caveat: the shape of the SDK's errors is read, not guaranteed. An upstream
 * that answers a quota with a 200 stream error, or a 5xx with a body the SDK
 * cannot classify, is not on the list: the run fails instead of failing over
 * (under-reporting, never a wrong move). Widen the lists below with a row in
 * tests/failover.test.ts.
 */

export type FailoverReason = 'rate_limited' | 'upstream_error' | 'unavailable';

/** What the failed attempt is booked at, when the upstream reported no usage. */
export type FailedBilling = 'none' | 'estimate';

export interface FailoverClass {
	reason: FailoverReason;
	billing: FailedBilling;
}

/** The statuses of a busy or broken upstream: 500-504, and 429. */
const SERVER_STATUS = new Set([500, 501, 502, 503, 504]);

/** A socket that broke before the first byte: reset, refused, or not found. */
const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'UND_ERR_SOCKET']);

/** How deep an error wraps another one: RetryError -> APICallError -> TypeError -> cause. */
const MAX_UNWRAP = 5;

const ownErrors = new WeakSet<object>();

/**
 * Tags an error thrown by OUR code inside the model call (the budget of a
 * step, a tool): its status, if any, is not the upstream's, so it never moves
 * the run.
 */
export function markOwnError(error: unknown): void {
	if (typeof error === 'object' && error !== null) ownErrors.add(error);
}

function networkCode(error: unknown): string | undefined {
	const code = (error as { code?: unknown } | null)?.code;
	return typeof code === 'string' && NETWORK_CODES.has(code) ? code : undefined;
}

/** The APICallError under a RetryError or a `cause` chain, when there is one. */
export function apiCallOf(error: unknown): APICallError | undefined {
	let current: unknown = error;
	for (let depth = 0; depth < MAX_UNWRAP && current !== undefined && current !== null; depth += 1) {
		if (RetryError.isInstance(current)) current = current.lastError;
		else if (APICallError.isInstance(current)) return current;
		else current = (current as { cause?: unknown }).cause;
	}
	return undefined;
}

/** The class of a failure, or null when the run must end instead of moving. */
export function classifyFailure(error: unknown): FailoverClass | null {
	let current: unknown = error;
	let network = false;
	for (let depth = 0; depth < MAX_UNWRAP && current !== undefined && current !== null; depth += 1) {
		if (typeof current === 'object' && ownErrors.has(current)) return null;
		if (RetryError.isInstance(current)) {
			current = current.lastError;
			continue;
		}
		if (networkCode(current)) network = true;
		if (APICallError.isInstance(current) && current.statusCode !== undefined) {
			if (current.statusCode === 429) return { reason: 'rate_limited', billing: 'none' };
			if (SERVER_STATUS.has(current.statusCode)) return { reason: 'upstream_error', billing: 'none' };
			return null;
		}
		current = (current as { cause?: unknown }).cause;
	}
	return network ? { reason: 'unavailable', billing: 'estimate' } : null;
}

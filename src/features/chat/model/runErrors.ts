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
  /** Whether the table knows this code: an unknown one has its own words. */
  known: boolean;
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

/**
 * The seconds a refusal asked the client to wait, when it said.
 *
 * The service answers a refusal with its headers; the client keeps the
 * seconds, never the headers: the messages are written down.
 */
export function retryAfterOf(error: unknown): number | null {
  const headers = (error as { headers?: { get?: (name: string) => unknown } } | null)?.headers;
  const raw = headers?.get?.("retry-after");
  if (typeof raw !== "string") return null;
  const seconds = Number(raw.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : null;
}

/** The code of a failure — the service's own, when it carries one. */
export function failureCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "internal";
}

/** Every code the service sends, and the sentence the pane says for it. */
const MESSAGES: Record<string, (retryAfter: number | null) => string> = {
  rate_limited: (retryAfter) => `Too many requests — try again in ${retryAfter ?? 60} s`,
  budget_exhausted: () => "Today's AI budget is used up",
  model_no_vision: () => "This model cannot see images",
  vision_unavailable: () => "Vision is unavailable for this model",
  attachment_not_found: () => "An attachment could not be found",
  upstream_unavailable: () => "The AI service is unavailable — try again",
  upstream_error: () => "The AI service failed — try again",
  network_error: () => "Connection lost — resuming",
  cancelled: () => "The run was cancelled",
  timeout: () => "The model took too long — try again",
  model_not_allowed: () => "That model is not available on this platform",
  run_in_progress: () => "A run is already going on in this conversation",
  payload_too_large: () => "That message is too long",
  invalid_request: () => "The request was rejected",
  not_found: () => "That conversation is gone",
  unauthenticated: () => "Your session expired. Sign in again to keep talking.",
  run_expired: () => "That answer expired and can no longer be resumed",
  resume_failed: () => "The connection dropped and the run could not be resumed",
  no_stream: () => "The service answered without a stream",
  endpoint_not_allowed: () => "Our server refused that address",
  provider_not_supported: () => "We do not support that provider yet",
  oauth_failed: () => "The sign-in did not go through. Start it again.",
  internal: () => "Something went wrong. Try again.",
};

/** The codes that may be retried, and the codes that wait first. */
const RETRYABLE = new Set(["rate_limited", "upstream_unavailable", "upstream_error", "network_error"]);

/**
 * What a failure says, and whether it may be tried again.
 *
 * The code that the service sends is the whole of the decision: the text is
 * a table, and the retry is a table too.
 */
export function runError(code: string, headers?: unknown): RunErrorInfo {
  const factory = MESSAGES[code];
  if (!factory) return { text: "", retryAfter: null, retry: false, known: false };
  const retryAfter = code === "rate_limited" ? parseRetryAfter(headers) : null;
  return { text: factory(retryAfter), retryAfter, retry: RETRYABLE.has(code), known: true };
}

/** The moment a retry is allowed: the end of the countdown. */
export function retryDeadline(retryAfter: number | null, now: number): number | null {
  if (retryAfter === null || retryAfter <= 0) return null;
  return now + retryAfter * 1000;
}

/** The seconds that are left before a retry is allowed. */
export function secondsLeft(deadline: number | null, now: number): number | null {
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/**
 * The sentence of the notice, with the seconds that are left.
 *
 * A rate limit counts down: the reader knows how long they wait before the
 * button appears.
 */
export function noticeText(info: RunErrorInfo, left: number | null): string {
  if (info.retryAfter === null || left === null) return info.text;
  if (left > 0) return `Too many requests — try again in ${left} s`;
  return "Too many requests — try again";
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

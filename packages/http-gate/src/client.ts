/**
 * A small JSON-over-HTTP client with built-in request hygiene: bounded
 * concurrency plus in-flight GET de-duplication.
 *
 * The client resolves NOTHING from ambient state — no env vars, no globals. The
 * host passes a `baseUrl` and, per call, an optional bearer token. That is what
 * makes it reusable: token policy (which session, which audience) belongs to the
 * host, not to the transport.
 */

import { ApiError, type ApiErrorBody } from './errors.ts';
import { createInflightDedupe, createRequestGate } from './gate.ts';

/** Minimal `fetch` shape, so a test can inject a stub without a network. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  /** Origin (and optional prefix) every path is appended to. */
  baseUrl: string;
  /** Max simultaneous requests. Defaults to 6. */
  maxConcurrent?: number;
  /** Injectable `fetch`, for tests or a non-browser host. */
  fetchImpl?: FetchLike;
  /** Error message thrown when `baseUrl` is empty. */
  missingBaseUrlMessage?: string;
}

/** Typed verb helpers. `jwt`, when given, becomes the Bearer token. */
export interface HttpClient {
  get<T>(path: string, jwt?: string): Promise<T>;
  post<T>(path: string, body: unknown, jwt?: string): Promise<T>;
  put<T>(path: string, body: unknown, jwt?: string): Promise<T>;
  patch<T>(path: string, body: unknown, jwt?: string): Promise<T>;
  delete<T>(path: string, jwt?: string): Promise<T>;
}

const DEFAULT_MISSING_BASE_URL = 'HTTP client base URL is not configured.';

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const {
    baseUrl,
    maxConcurrent = 6,
    fetchImpl,
    missingBaseUrlMessage = DEFAULT_MISSING_BASE_URL,
  } = options;

  const gate = createRequestGate(maxConcurrent);
  const inflightGets = createInflightDedupe();
  // Resolve `fetch` per call rather than at construction: a host that installs a
  // fetch polyfill after wiring the client still works.
  const doFetch: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));

  async function send<T>(method: string, path: string, body?: unknown, jwt?: string): Promise<T> {
    // Checked before a slot is taken, so a misconfigured client fails fast
    // instead of occupying the gate.
    if (!baseUrl) throw new Error(missingBaseUrlMessage);

    return gate.run(async () => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

      const res = await doFetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body == null ? undefined : JSON.stringify(body),
      });

      if (!res.ok) {
        const errorBody = (await res.json().catch(() => null)) as ApiErrorBody | null;
        throw new ApiError(
          errorBody?.error ?? errorBody?.message ?? `${method} ${path} → ${res.status} ${res.statusText}`,
          res.status,
          errorBody?.code ?? 'API_ERROR',
          errorBody?.details,
        );
      }
      if (res.status === 204) return undefined as T;
      return res.json() as Promise<T>;
    });
  }

  function request<T>(method: string, path: string, body?: unknown, jwt?: string): Promise<T> {
    // Only GET is shared: it is the only verb assumed side-effect free. The key
    // deliberately omits the token — concurrent GETs for one path in one app
    // session carry the same credential.
    if (method !== 'GET') return send<T>(method, path, body, jwt);
    return inflightGets.share(`GET ${path}`, () => send<T>(method, path, body, jwt));
  }

  return {
    get: <T>(path: string, jwt?: string) => request<T>('GET', path, undefined, jwt),
    post: <T>(path: string, body: unknown, jwt?: string) => request<T>('POST', path, body, jwt),
    put: <T>(path: string, body: unknown, jwt?: string) => request<T>('PUT', path, body, jwt),
    patch: <T>(path: string, body: unknown, jwt?: string) => request<T>('PATCH', path, body, jwt),
    delete: <T>(path: string, jwt?: string) => request<T>('DELETE', path, undefined, jwt),
  };
}

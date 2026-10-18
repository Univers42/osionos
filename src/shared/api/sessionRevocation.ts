/**
 * Detects "this app session was signed out everywhere" on bridge responses.
 *
 * The bridge answers any call made with a revoked token 401 `{ code: "session_revoked" }`.
 * That body is the whole signal: a plain 401 (expired, malformed, wrong audience) is NOT a
 * revocation and must not sign anyone out. Wrapped once around the shared `api` client's
 * fetch, so no feature carries its own 401 handling.
 *
 * Caveat: only calls that go through the wrapped fetch are covered. A raw `fetch` to the
 * bridge (media upload, unload keepalive) still fails quietly on a revoked token; the next
 * call through `api` catches it.
 */

export const SESSION_REVOKED_CODE = "session_revoked";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The bearer token a request was sent with, or null. */
export function bearerOf(init?: RequestInit): string | null {
  const header = new Headers(init?.headers).get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : null;
}

async function isRevocationBody(response: Response): Promise<boolean> {
  const body = (await response.clone().json().catch(() => null)) as { code?: unknown } | null;
  return body?.code === SESSION_REVOKED_CODE;
}

/** `inner`, reporting the token of every `session_revoked` 401 to `onRevoked`. The response is returned untouched. */
export function revocationAwareFetch(inner: FetchLike, onRevoked: (token: string) => void): FetchLike {
  return async (input, init) => {
    const response = await inner(input, init);
    if (response.status !== 401) return response;
    const token = bearerOf(init);
    if (token && await isRevocationBody(response)) {
      try {
        onRevoked(token);
      } catch (error) {
        console.error("[osionos] session-revoked handler failed:", error);
      }
    }
    return response;
  };
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   client.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * App-side binding for `@osionos/http-gate`.
 *
 * The transport mechanism (bounded concurrency, in-flight GET de-duplication,
 * the error envelope) lives in the package. What stays here is the part that is
 * genuinely osionos policy and cannot travel:
 *
 *   - where the bridge lives   → `VITE_API_URL`
 *   - which token a call uses  → the `__playgroundUserStore` global
 *
 * Consumers keep importing `api` / `API_BASE` / `getActivePageJwt` from this
 * module exactly as before; only the implementation moved.
 */

import { ApiError, createHttpClient } from '@osionos/http-gate';
import { refreshAwareFetch } from './sessionRefreshAware';
import { revocationAwareFetch } from './sessionRevocation';
import { sudoRequiredAwareFetch } from './sudoRequired';

export { ApiError };
export type { ApiErrorBody } from '@osionos/http-gate';

// `import.meta.env` is Vite's; under plain node (the canvas tests) it is not
// there at all, and reading a property of it would throw on import.
export const API_BASE = (((import.meta.env ?? {}) as Record<string, string>)['VITE_API_URL'] ?? '').trim();

/**
 * The user store publishes itself on `globalThis` as a decoupling seam (it is
 * also read by the page-access ACL and by vendored realtime/feed code). Reading
 * it here — rather than inside the package — is what keeps the transport
 * reusable: token policy is the app's, not the client's.
 */
function userStore<T>(read: (state: Record<string, unknown>) => T): T | null {
  try {
    const store = (globalThis as unknown as Record<string, unknown>).__playgroundUserStore as
      | { getState: () => Record<string, unknown> }
      | undefined;
    const state = store?.getState();
    return state ? read(state) : null;
  } catch {
    return null;
  }
}

/** The gotrue-audience JWT for the active session, if any. */
export function getActiveJwt(): string | null {
  return userStore((state) => (state.activeJwt as (() => string | null) | undefined)?.() || null);
}

/**
 * The page-audience JWT, falling back to the session JWT. These are distinct
 * tokens — passing the wrong one makes the bridge silently skip the fetch.
 */
export function getActivePageJwt(): string | null {
  return userStore((state) => {
    const pageJwt = (state.activePageJwt as (() => string | null) | undefined)?.();
    return pageJwt || (state.activeJwt as (() => string | null) | undefined)?.() || null;
  });
}

/** The id of the workspace in use, when a session has one. */
export function getActiveWorkspaceId(): string | null {
  return userStore((state) => {
    const workspace = (state.activeWorkspace as (() => { _id?: string } | null) | undefined)?.();
    return workspace?._id ?? null;
  });
}

/** Tells the user store a bridge call came back 401 session_revoked, so it drops the session that owned the token. */
export function reportRevokedSession(token: string): void {
  userStore((state) => (state.handleSessionRevoked as ((token: string) => void) | undefined)?.(token));
}

/** The token that replaces `token` after the user store rotated the session that owns it, or null. */
async function refreshOwnerOf(token: string): Promise<string | null> {
  const owner = userStore((state) => Object.values((state.sessions ?? {}) as Record<string, { userId: string; accessToken: string }>)
    .find((session) => session.accessToken === token)?.userId);
  if (!owner) return null;
  await userStore((state) => (state.refreshAccount as ((userId: string) => Promise<unknown>) | undefined)?.(owner));
  return userStore((state) => (state.sessions as Record<string, { accessToken: string }>)[owner]?.accessToken ?? null);
}

/** Thin fetch wrapper exposing typed GET/POST/PATCH/DELETE helpers. */
export const api = createHttpClient({
  baseUrl: API_BASE,
  maxConcurrent: 6,
  fetchImpl: sudoRequiredAwareFetch(refreshAwareFetch(
    revocationAwareFetch((input, init) => fetch(input, init), reportRevokedSession),
    refreshOwnerOf,
  )),
  missingBaseUrlMessage: 'VITE_API_URL is not configured.',
});

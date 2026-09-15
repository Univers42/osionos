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

export { ApiError };
export type { ApiErrorBody } from '@osionos/http-gate';

export const API_BASE = ((import.meta.env as Record<string, string>)['VITE_API_URL'] ?? '').trim();

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

/** Thin fetch wrapper exposing typed GET/POST/PATCH/DELETE helpers. */
export const api = createHttpClient({
  baseUrl: API_BASE,
  maxConcurrent: 6,
  missingBaseUrlMessage: 'VITE_API_URL is not configured.',
});

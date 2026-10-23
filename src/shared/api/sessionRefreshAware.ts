/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sessionRefreshAware.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Replays a request once, with a refreshed token, after the bridge answered it 401.
 *
 * Sits OUTSIDE `revocationAwareFetch`: a `session_revoked` 401 is the revocation wrapper's
 * (the session is gone, nothing to refresh) and is never retried here; the replay goes back
 * through that wrapper, so a revoked replay is still reported against the token it used.
 *
 * Caveat: only a body that can be sent twice is replayed (none, a string, URLSearchParams,
 * FormData or Blob); a streamed upload that gets a 401 is handed back as is. A token rotated
 * more than REMEMBER_MS ago that still comes back 401 is not replayed with its successor.
 */

import { bearerOf, SESSION_REVOKED_CODE } from './sessionRevocation';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const REMEMBER_MS = 60_000;

function isReplayable(init?: RequestInit): boolean {
  const body = init?.body;
  return body == null || typeof body === 'string' || body instanceof URLSearchParams
    || (typeof FormData !== 'undefined' && body instanceof FormData)
    || (typeof Blob !== 'undefined' && body instanceof Blob);
}

async function saysRevoked(response: Response): Promise<boolean> {
  const body = await response.clone().json().catch(() => null) as { code?: unknown } | null;
  return body?.code === SESSION_REVOKED_CODE;
}

function withBearer(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set('authorization', `Bearer ${token}`);
  return { ...init, headers };
}

function forgetLater(rotations: Map<string, unknown>, token: string) {
  // Node's timer would hold a test process open; a browser timer has no unref.
  const timer = setTimeout(() => rotations.delete(token), REMEMBER_MS) as unknown as { unref?: () => void };
  timer.unref?.();
}

/**
 * `refresh(oldToken)` resolves the token that replaces `oldToken`, or null. Calls for one
 * old token share one refresh, and a success is remembered for REMEMBER_MS so a request that
 * was already in flight with the old token finds its successor instead of refreshing again.
 */
export function refreshAwareFetch(inner: FetchLike, refresh: (token: string) => Promise<string | null>): FetchLike {
  const rotations = new Map<string, Promise<string | null>>();

  function successorOf(token: string): Promise<string | null> {
    const known = rotations.get(token);
    if (known) return known;
    const started = refresh(token).catch(() => null).then((next) => {
      if (next) forgetLater(rotations, token);
      else rotations.delete(token);
      return next;
    });
    rotations.set(token, started);
    return started;
  }

  return async (input, init) => {
    const response = await inner(input, init);
    const token = bearerOf(init);
    if (response.status !== 401 || !token || !isReplayable(init) || await saysRevoked(response)) return response;
    const next = await successorOf(token);
    return next && next !== token ? inner(input, withBearer(init, next)) : response;
  };
}

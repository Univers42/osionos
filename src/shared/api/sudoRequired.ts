/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sudoRequired.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Detects the bridge's "prove you are still you" (sudo) refusal.
 *
 * `requireSudo` answers 403 `{ code: "sudo_required" }`. That body is the whole
 * signal: a plain 403 (forbidden, not sudo) is NOT a sudo prompt and must not
 * raise one. The wrapper sits around the shared `api` client's fetch, so no
 * feature carries its own 403 handling; P1-6's `SudoPrompt` listens here.
 *
 * Caveat: the path is the pathname of the request URL, so a bridge mounted
 * under a path prefix reports the prefixed path (`/bridge/api/…`), not the
 * route the app asked for.
 */

export const SUDO_REQUIRED_CODE = 'sudo_required';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** What a listener is told about the refused request. */
export interface SudoRequiredEvent {
  method: string;
  path: string;
}

type SudoListener = (event: SudoRequiredEvent) => void;

const listeners = new Set<SudoListener>();

/** Listen for sudo refusals. Returns an unsubscribe function. */
export function onSudoRequired(listener: SudoListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function isSudoBody(response: Response): Promise<boolean> {
  const body = (await response.clone().json().catch(() => null)) as { code?: unknown } | null;
  return body?.code === SUDO_REQUIRED_CODE;
}

/** The pathname of a request URL, or the raw input when it is not a URL. */
function pathOf(input: string): string {
  try {
    return new URL(input).pathname;
  } catch {
    return input;
  }
}

/** `inner`, reporting every `sudo_required` 403 to the listeners. The response is returned untouched. */
export function sudoRequiredAwareFetch(inner: FetchLike): FetchLike {
  return async (input, init) => {
    const response = await inner(input, init);
    if (response.status !== 403) return response;
    if (!(await isSudoBody(response))) return response;
    const event: SudoRequiredEvent = { method: (init?.method ?? 'GET').toUpperCase(), path: pathOf(input) };
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error('[osionos] sudo-required handler failed:', error);
      }
    }
    return response;
  };
}

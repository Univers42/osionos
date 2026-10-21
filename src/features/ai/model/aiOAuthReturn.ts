/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiOAuthReturn.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * The way back from OpenRouter.
 *
 * The service sends the browser to OpenRouter with a PKCE challenge; OpenRouter
 * sends it back to the same page with `?code=…&state=…`. This module reads
 * that return, hands the code to the service ONCE, and takes the parameters
 * off the URL so a reload does not try again.
 */

/** The two parameters of an OAuth return. */
export interface OAuthReturn {
  code: string;
  state: string;
}

/** Reads the OAuth parameters of a URL — null when there are none. */
export function readOAuthReturn(href: string): OAuthReturn | null {
  let params: URLSearchParams;
  try {
    params = new URL(href, "http://localhost/").searchParams;
  } catch {
    return null;
  }
  const code = params.get("code")?.trim() ?? "";
  const state = params.get("state")?.trim() ?? "";
  if (!code || !state) return null;
  return { code, state };
}

/** The URL without the OAuth parameters — the page's own path, kept relative. */
export function stripOAuthParams(href: string): string {
  try {
    const url = new URL(href, "http://localhost/");
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

/** What {@link completeOAuthReturn} needs from the outside. */
export interface OAuthReturnOptions {
  /** The page's URL — where the service must send the browser back. */
  href: string;
  /** Exchanges the code for a connection (the service's route). */
  complete: (code: string, state: string) => Promise<unknown>;
  /** Takes the parameters off the URL (`history.replaceState`). */
  replace: (url: string) => void;
}

/**
 * Finishes an OAuth return, once.
 *
 * Without `code` and `state` there is nothing to do: the page is left alone.
 * With them, the parameters are taken off the URL FIRST — so a remount or a
 * reload cannot try the same code twice — and the code is exchanged once.
 */
export async function completeOAuthReturn(options: OAuthReturnOptions): Promise<boolean> {
  const found = readOAuthReturn(options.href);
  if (!found) return false;
  options.replace(stripOAuthParams(options.href));
  await options.complete(found.code, found.state);
  return true;
}

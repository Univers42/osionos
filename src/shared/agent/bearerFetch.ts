/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bf.ts                                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** The bridge answers an agent run only to a signed-in caller, but the SSE reader posts with a
 *  plain fetch that carries no Authorization. This adds the session JWT when there is one;
 *  without a session the request goes out unchanged and the bridge refuses it as before. */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function bearerFetch(fetchImpl: FetchLike, getJwt: () => string | null): FetchLike {
  return (input, init) => {
    const jwt = getJwt();
    if (!jwt) return fetchImpl(input, init);
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${jwt}`);
    return fetchImpl(input, { ...init, headers });
  };
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   searchRefusal.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 01:50:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 01:50:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Photo and video search go through the bridge, which answers 401 to a caller
// with no app session and 429 to one past their rate limit. Both are answers,
// not an outage: a picker says which, instead of calling the bridge "offline"
// or quietly showing the built-in gallery as if it were the search result.

function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) return null;
  return typeof error.status === "number" ? error.status : null;
}

/** What to tell the user when the bridge refused a search; null for any other failure. */
export function searchRefusalNotice(error: unknown): string | null {
  const status = statusOf(error);
  if (status === 401) return "Sign in to search online.";
  if (status === 429) return "Too many searches. Wait a few seconds, then try again.";
  return null;
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profileLinkParam.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Same shape the bridge accepts (USERNAME_SHAPE in scripts/bridge-account-profile.mjs): a
// value outside it is never put in a request path.
const USERNAME_SHAPE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{2,31}$/;

/** The username a `?u=<username>` link asks for, or null when it names nothing valid. */
export function readProfileLinkUsername(search: string): string | null {
  const requested = new URLSearchParams(search).get("u");
  return requested !== null && USERNAME_SHAPE.test(requested) ? requested : null;
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   platformRole.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The app's copy of the platform role vocabulary.
 *
 * The bridge owns the roles (scripts/bridge-roles.mjs); the app cannot import from
 * `scripts/**`, so the two copies live side by side and the agreement test pins them
 * against each other. A name the bridge does not know is not a role here either.
 *
 * The role is a hint, never the authority: every admin route re-reads the role from the
 * database on the request, so a stale claim can only hide a surface, never open one.
 */

import type { PlatformRole } from '@/entities/user';

export type { PlatformRole };

/** The four platform roles, from the strongest to the weakest. */
export const PLATFORM_ROLES = ['admin', 'moderator', 'user', 'guest'] as const;

/** How strong each role is: an admin outranks a moderator, a guest outranks nothing. */
export const ROLE_RANK: Record<PlatformRole, number> = {
  admin: 3,
  moderator: 2,
  user: 1,
  guest: 0,
};

/** True when the value is one of the four names the platform knows. */
export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === 'string' && Object.hasOwn(ROLE_RANK, value);
}

/**
 * True when `role` outranks (or is) `min`. An unknown role — and no role at all — is never
 * at least anything: a caller that cannot name a role must not be let in.
 */
export function roleAtLeast(role: PlatformRole | null | undefined, min: PlatformRole): boolean {
  if (!isPlatformRole(role) || !isPlatformRole(min)) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** The highest-ranked name of the list, null for an empty list or an unknown name. */
export function roleFromNames(names: readonly (string | null | undefined)[] | null | undefined): PlatformRole | null {
  let best: PlatformRole | null = null;
  for (const name of names ?? []) {
    if (!isPlatformRole(name)) continue;
    if (best === null || ROLE_RANK[name] > ROLE_RANK[best]) best = name;
  }
  return best;
}

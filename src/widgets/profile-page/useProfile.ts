/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useProfile.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * One member's public profile from the bridge (GET /api/profile/:userId),
 * merged with the public projection (GET /api/users/:username).
 *
 * Caveat: two reads per profile view until P2-1 serves one projection; the
 * 60 s refresh repeats both. A failed second read keeps the first result.
 */

import { useCallback, useEffect, useState } from 'react';

import { api, getActivePageJwt } from '@/shared/api/client';
import { bridgeMediaUrl } from '@/shared/lib/media/bridgeMediaUrl';

import type { PersonStatus } from '@/shared/social/followApi';
import { parseStatus } from './model/profileStatus';
import type { ReadmeProjection } from './ReadmeBlocks';

export interface MemberProfile {
  userId: string;
  name: string;
  avatar: string | null;
  role: string | null;
  workspaceId: string | null;
  lastSeenAt: string | null;
  online: boolean;
  // Widened fields (admin-authored profile binding). Optional so existing
  // callers keep compiling; the bridge fills them in GET /api/profile/:userId.
  username?: string | null;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  joinedAt?: string | null;
  directoryOptOut?: boolean;
  customFields?: Record<string, unknown> | null;
  // From GET /api/users/:username (the server's public projection).
  pronouns?: string | null;
  company?: string | null;
  website?: string | null;
  links?: string[] | null;
  timezone?: string | null;
  orcid?: string | null;
  patreon?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  profession?: string | null;
  readme?: ReadmeProjection | null;
  status?: PersonStatus | null;
}

// The only keys copied from the public projection: a private field the server
// ever adds there must not reach the page by accident.
export const PUBLIC_FIELD_KEYS = [
  'pronouns', 'headline', 'bio', 'location', 'company', 'website', 'links',
  'timezone', 'orcid', 'patreon', 'avatarUrl', 'bannerUrl', 'profession', 'readme', 'status',
] as const;

export function mergePublicFields(base: MemberProfile, pub: Record<string, unknown>): MemberProfile {
  const merged: Record<string, unknown> = { ...base };
  for (const key of PUBLIC_FIELD_KEYS) if (key in pub) merged[key] = pub[key];
  if ('status' in pub) merged.status = parseStatus(pub.status);
  // The name the owner just saved lives on the card; the legacy route's copy would show the old one.
  if (typeof pub.displayName === 'string' && pub.displayName.trim()) merged.name = pub.displayName;
  for (const key of ['avatarUrl', 'bannerUrl'] as const) {
    if (typeof merged[key] === 'string') merged[key] = bridgeMediaUrl(merged[key] as string);
  }
  return merged as unknown as MemberProfile;
}

// The account card is the one source of these three: the legacy route's older copy can
// disagree with it, and for a viewer the card reduces (directory opt-out) it is the only one
// that withholds them.
export function withoutLegacyCard(base: MemberProfile): MemberProfile {
  return { ...base, headline: null, bio: null, location: null };
}

const REFRESH_MS = 60_000;

export function useProfile(userId: string) {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [error, setError] = useState('');
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => {
      const jwt = getActivePageJwt();
      if (!jwt || !userId) return;
      api.get<MemberProfile>(`/api/profile/${encodeURIComponent(userId)}`, jwt)
        .then(async (reply) => {
          let merged = withoutLegacyCard(reply);
          if (reply.username) {
            try {
              const pub = await api.get<Record<string, unknown>>(`/api/users/${encodeURIComponent(reply.username)}`, jwt);
              merged = mergePublicFields(merged, pub);
            } catch { /* keep the first read, no error state */ }
          }
          if (alive) { setProfile(merged); setError(''); }
        })
        .catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : 'Profile unavailable.'); });
    };
    load();
    const timer = setInterval(load, REFRESH_MS); // keep the presence dot honest
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [userId, reloads]);

  const reload = useCallback(() => setReloads((count) => count + 1), []);
  return { profile, error, reload };
}

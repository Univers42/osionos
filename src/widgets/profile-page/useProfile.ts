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

import { useEffect, useState } from 'react';

import { api, getActivePageJwt } from '@/shared/api/client';

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
  readme?: ReadmeProjection | null;
}

// The only keys copied from the public projection: a private field the server
// ever adds there must not reach the page by accident.
export const PUBLIC_FIELD_KEYS = [
  'pronouns', 'headline', 'bio', 'location', 'company', 'website', 'links',
  'timezone', 'orcid', 'patreon', 'avatarUrl', 'bannerUrl', 'readme',
] as const;

export function mergePublicFields(base: MemberProfile, pub: Record<string, unknown>): MemberProfile {
  const merged: Record<string, unknown> = { ...base };
  for (const key of PUBLIC_FIELD_KEYS) if (key in pub) merged[key] = pub[key];
  return merged as unknown as MemberProfile;
}

const REFRESH_MS = 60_000;

export function useProfile(userId: string) {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => {
      const jwt = getActivePageJwt();
      if (!jwt || !userId) return;
      api.get<MemberProfile>(`/api/profile/${encodeURIComponent(userId)}`, jwt)
        .then(async (reply) => {
          let merged = reply;
          if (reply.username) {
            try {
              const pub = await api.get<Record<string, unknown>>(`/api/users/${encodeURIComponent(reply.username)}`, jwt);
              merged = mergePublicFields(reply, pub);
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
  }, [userId]);

  return { profile, error };
}

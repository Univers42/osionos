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

/** One member's public profile from the bridge (GET /api/profile/:userId). */

import { useEffect, useState } from 'react';

import { api, getActivePageJwt } from '@/shared/api/client';

export interface MemberProfile {
  userId: string;
  name: string;
  avatar: string | null;
  role: string | null;
  workspaceId: string | null;
  lastSeenAt: string | null;
  online: boolean;
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
        .then((reply) => { if (alive) { setProfile(reply); setError(''); } })
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

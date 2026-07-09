/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useProfileShares.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Posts a member shared to their profile (GET /api/profile/:userId/shares). */

import { useEffect, useState } from 'react';

import { api, getActivePageJwt } from '@/shared/api/client';

export interface ProfileShare {
  pageId: string;
  title: string;
  icon: string | null;
  cover: string | null;
  sharedAt: string;
}

export function useProfileShares(userId: string): ProfileShare[] {
  const [shares, setShares] = useState<ProfileShare[]>([]);
  useEffect(() => {
    let alive = true;
    const jwt = getActivePageJwt();
    if (!jwt || !userId) return undefined;
    api.get<{ shares?: ProfileShare[] }>(`/api/profile/${encodeURIComponent(userId)}/shares`, jwt)
      .then((reply) => { if (alive) setShares(Array.isArray(reply.shares) ? reply.shares : []); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [userId]);
  return shares;
}

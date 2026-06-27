/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePresenceHeartbeat.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Presence = bridge heartbeat (documented decision; see bridge-profile.mjs):
 * POST /api/profile/heartbeat every 45s bumps last_seen_at; anyone seen
 * within 90s renders online. Module-level singleton so multiple mounted
 * widgets (profile view, DM list, search bar) share ONE interval.
 */

import { useEffect } from 'react';

import { api, getActivePageJwt } from '@/shared/api/client';

const HEARTBEAT_MS = 45_000;
let consumers = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function beat(): void {
  const jwt = getActivePageJwt();
  if (!jwt) return;
  void api.post('/api/profile/heartbeat', {}, jwt).catch(() => undefined);
}

export function usePresenceHeartbeat(): void {
  useEffect(() => {
    consumers += 1;
    if (consumers === 1) {
      beat();
      timer = setInterval(beat, HEARTBEAT_MS);
    }
    return () => {
      consumers -= 1;
      if (consumers === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
}

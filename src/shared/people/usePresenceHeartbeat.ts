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
import type { PresenceChoice } from '@/features/settings/people/peopleSocialModel';

export interface PresenceSetting {
  state: PresenceChoice;
  customText: string | null;
}

const STORAGE_KEY = 'osionos:presence';

const HEARTBEAT_MS = 45_000;
/** The bridge allows 10 beats a minute per user across every tab and device
 *  (scripts/bridge-presence.mjs); a remount this soon after a beat adds nothing, since
 *  presence lasts 90 s. Route changes beat on every mount and answered 429 (2026-11-04). */
const REMOUNT_BEAT_GAP_MS = 15_000;
let consumers = 0;
let lastBeatAt = Number.NEGATIVE_INFINITY;
let timer: ReturnType<typeof setInterval> | null = null;
let setting: PresenceSetting | null = null;

/** The person's own choice, or null when they never made one (a plain beat keeps the
 *  bridge's default of online).
 *  Caveat: the choice lives in this browser; a second device beats with its own. */
export function getPresenceSetting(): PresenceSetting | null {
  if (setting) return setting;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as PresenceSetting | null;
    if (stored && typeof stored.state === 'string') setting = { state: stored.state, customText: stored.customText ?? null };
  } catch { /* storage blocked or unreadable: the choice is simply not remembered */ }
  return setting;
}

function beat(now = Date.now()): void {
  const jwt = getActivePageJwt();
  if (!jwt) return;
  lastBeatAt = now;
  const chosen = getPresenceSetting();
  void api.post('/api/profile/heartbeat', chosen ?? {}, jwt).catch(() => undefined);
}

/** Remembers the choice and tells the bridge now rather than at the next 45 s beat. */
export function setPresenceSetting(next: PresenceSetting): void {
  setting = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* not remembered across reloads */ }
  beat();
}

/** The beat a consumer's first mount sends, unless this tab beat within the last 15 s. */
export function beatOnMount(now = Date.now()): void {
  if (now - lastBeatAt < REMOUNT_BEAT_GAP_MS) return;
  beat(now);
}

export function usePresenceHeartbeat(): void {
  useEffect(() => {
    consumers += 1;
    if (consumers === 1) {
      beatOnMount();
      timer = setInterval(() => beat(), HEARTBEAT_MS);
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

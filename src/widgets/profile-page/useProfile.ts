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

import type { PageEntry } from '@/entities/page';
import { fetchAccountProfile, type AccountProfileOutcome } from '@/shared/api/accountProfileApi';
import { api, getActivePageJwt } from '@/shared/api/client';
import { bridgeMediaUrl } from '@/shared/lib/media/bridgeMediaUrl';

import type { PersonStatus } from '@/shared/social/followApi';
import { parseStatus } from './model/profileStatus';
import type { ReadmeProjection } from './ReadmeBlocks';

export interface MemberProfile {
  userId: string;
  name: string;
  avatar: string | null;
  // Sent to the subject only (U5-4): another viewer's profile carries neither key.
  role?: string | null;
  workspaceId?: string | null;
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

export interface ProfileIo {
  getLegacy: () => Promise<MemberProfile>;
  getCard: (username: string) => Promise<Record<string, unknown>>;
  getOwn: () => Promise<AccountProfileOutcome>;
  getOwnPage: (pageId: string) => Promise<PageEntry | null>;
}

// The card is looked up by NAME, and the legacy and typed tables can disagree about who holds
// one (beta, 2026-11-18: account A's page showed account B's "dev"), so only the requested
// user's own card is merged.
function isCardOf(userId: string, card: Record<string, unknown>): boolean {
  return typeof card.userId === 'string' && card.userId.toLowerCase() === userId.toLowerCase();
}

async function readCard(userId: string, username: string | null | undefined, io: ProfileIo) {
  if (!username) return null;
  try {
    const card = await io.getCard(username);
    return isCardOf(userId, card) ? card : null;
  } catch { return null; /* keep the first read, no error state */ }
}

// Same cap as the bridge's projectReadme, so the owner and a visitor agree on "too large".
const README_BYTE_CAP = 200 * 1024;

async function readOwnReadme(pageId: string, io: ProfileIo): Promise<ReadmeProjection | null> {
  try {
    const page = await io.getOwnPage(pageId);
    if (!page || page.archivedAt) return null;
    const blocks = page.content ?? [];
    return new TextEncoder().encode(JSON.stringify(blocks)).length > README_BYTE_CAP
      ? { pageId, truncated: true }
      : { pageId, blocks };
  } catch { return null; }
}

async function readOwnRow(io: ProfileIo): Promise<Record<string, unknown> | null> {
  try {
    const outcome = await io.getOwn();
    if (!outcome.ok) return null;
    const { readmePageId } = outcome.profile;
    const readme = readmePageId ? await readOwnReadme(readmePageId, io) : null;
    return readme ? { ...outcome.profile, readme } : { ...outcome.profile };
  } catch { return null; }
}

/**
 * Caveat: a visitor of an account with no username sees neither its card nor its README until
 * a username is claimed. A failed read of the owner's own page looks like "no README". The
 * owner's README here is their own page content un-neutralised (the bridge neutralises
 * bindings for other viewers); that is the owner's own data shown to the owner only, and the
 * own-row path is never taken for a visitor.
 */
export async function loadProfile(userId: string, isOwner: boolean, io: ProfileIo): Promise<MemberProfile> {
  const legacy = await io.getLegacy();
  const base = withoutLegacyCard(legacy);
  const card = await readCard(userId, legacy.username, io);
  const fields = card ?? (isOwner ? await readOwnRow(io) : null);
  return fields ? mergePublicFields(base, fields) : base;
}

// isOwner comes from the caller (the views already hold the active user); it is not read from
// the auth store here so the merge rules above stay importable without it.
export function useProfile(userId: string, isOwner = false) {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [error, setError] = useState('');
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => {
      const jwt = getActivePageJwt();
      if (!jwt || !userId) return;
      const io: ProfileIo = {
        getLegacy: () => api.get<MemberProfile>(`/api/profile/${encodeURIComponent(userId)}`, jwt),
        getCard: (username) => api.get<Record<string, unknown>>(`/api/users/${encodeURIComponent(username)}`, jwt),
        getOwn: fetchAccountProfile,
        getOwnPage: (pageId) => api.get<PageEntry>(`/api/pages/${encodeURIComponent(pageId)}`, jwt),
      };
      loadProfile(userId, isOwner, io)
        .then((merged) => { if (alive) { setProfile(merged); setError(''); } })
        .catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : 'Profile unavailable.'); });
    };
    load();
    const timer = setInterval(load, REFRESH_MS); // keep the presence dot honest
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [userId, isOwner, reloads]);

  const reload = useCallback(() => setReloads((count) => count + 1), []);
  return { profile, error, reload };
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   followApi.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/** Bridge clients for follow, the profile card and the owner's status. Each call is a
 *  no-op answer when the build has no bridge or the person has no session, so the
 *  offline build never makes a request and never logs an error. */

import { API_BASE, api, getActivePageJwt } from '@/shared/api/client';
import type { PresenceState } from '@/features/settings/people/peopleSocialModel';

export interface FollowCounts {
  followerCount: number;
  followingCount: number;
  viewerFollows: boolean;
}

export interface PersonStatus {
  emoji: string | null;
  text: string | null;
  expiresAt: string | null;
  busy: boolean;
}

export interface PersonCard {
  presence: { state: PresenceState; customText: string | null };
  status: PersonStatus | null;
}

export function socialAvailable(): boolean {
  return Boolean(API_BASE && getActivePageJwt());
}

const jwt = () => getActivePageJwt() ?? undefined;
const id = encodeURIComponent;

export async function followUser(userId: string): Promise<void> {
  await api.post('/api/social/follow', { followeeId: userId }, jwt());
}

export async function unfollowUser(userId: string): Promise<void> {
  await api.delete(`/api/social/follow/${id(userId)}`, jwt());
}

export async function fetchFollowCounts(userId: string): Promise<FollowCounts | null> {
  if (!socialAvailable()) return null;
  const reply = await api.get<Partial<FollowCounts>>(`/api/social/follow-counts/${id(userId)}`, jwt());
  return {
    followerCount: Number(reply.followerCount ?? 0),
    followingCount: Number(reply.followingCount ?? 0),
    viewerFollows: reply.viewerFollows === true,
  };
}

/** Presence and status as the bridge projects them for this viewer (blocks and opt-outs already applied). */
export async function fetchPersonCard(userId: string): Promise<PersonCard | null> {
  if (!socialAvailable()) return null;
  const reply = await api.get<{ presence?: { state?: PresenceState; customText?: string | null }; status?: PersonStatus | null }>(
    `/api/profile/${id(userId)}`, jwt());
  return {
    presence: { state: reply.presence?.state ?? 'offline', customText: reply.presence?.customText ?? null },
    status: reply.status ?? null,
  };
}

export async function saveOwnStatus(body: PersonStatus): Promise<PersonStatus | null> {
  if (!socialAvailable()) return null;
  return api.patch<PersonStatus>('/api/account/profile/status', body, jwt());
}

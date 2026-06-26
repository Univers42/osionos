/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   directoryApi.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Bridge directory + own-profile endpoints (bridge-profile contract). */

import { api, getActivePageJwt } from '@/shared/api/client';

export type DirectoryMode = 'text' | 'semantic' | 'hybrid';

export interface DirectoryPerson {
  id: string;
  name: string;
  username: string | null;
  avatar: string | null;
  headline: string | null;
  online: boolean;
}

export interface ProfilePatch {
  username?: string;
  bio?: string;
  headline?: string;
  location?: string;
  directoryOptOut?: boolean;
}

function jwt(): string | undefined {
  return getActivePageJwt() ?? undefined;
}

export async function searchDirectory(opts: {
  q: string;
  mode?: DirectoryMode;
  limit?: number;
}): Promise<DirectoryPerson[]> {
  const params = new URLSearchParams({ q: opts.q });
  if (opts.mode) params.set('mode', opts.mode);
  if (opts.limit) params.set('limit', String(opts.limit));
  const reply = await api.get<{ people: DirectoryPerson[] }>(`/api/directory/search?${params}`, jwt());
  return Array.isArray(reply.people) ? reply.people : [];
}

export async function fetchPeople(scope: 'org' | 'global' = 'org'): Promise<DirectoryPerson[]> {
  const reply = await api.get<{ people: DirectoryPerson[] }>(
    `/api/people?scope=${encodeURIComponent(scope)}`,
    jwt(),
  );
  return Array.isArray(reply.people) ? reply.people : [];
}

export async function patchProfileMe(patch: ProfilePatch): Promise<void> {
  await api.patch('/api/profile/me', patch, jwt());
}

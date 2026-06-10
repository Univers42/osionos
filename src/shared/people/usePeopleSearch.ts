/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePeopleSearch.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Debounced people search against the bridge directory (`/api/people` —
 * display-name search over org workspace members; emails are hashed at rest
 * and intentionally unsearchable). Shared by the topbar PeopleSearchBar, the
 * DM people picker, and the settings People panel.
 */

import { useEffect, useState } from 'react';

import { api, getActivePageJwt } from '@/shared/api/client';

export interface PersonHit {
  id: string;
  name: string;
  avatar: string | null;
  wsRole: string | null;
  online: boolean;
}

const DEBOUNCE_MS = 250;

export async function searchPeople(query: string): Promise<PersonHit[]> {
  const jwt = getActivePageJwt();
  if (!jwt) return [];
  const reply = await api.get<{ people: PersonHit[] }>(
    `/api/people?query=${encodeURIComponent(query)}`,
    jwt,
  );
  return Array.isArray(reply.people) ? reply.people : [];
}

export function usePeopleSearch(query: string) {
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      if (alive) setLoading(true);
      searchPeople(query)
        .then((hits) => { if (alive) setPeople(hits); })
        .catch(() => { if (alive) setPeople([]); })
        .finally(() => { if (alive) setLoading(false); });
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  return { people, loading };
}

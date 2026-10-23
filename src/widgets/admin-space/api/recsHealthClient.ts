/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   recsHealthClient.ts                                 :+:      :+:    :+:   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client of the recs health chart: the offline quality of every trained
 * model over time, and the daily click-through of the served recommendations.
 *
 * The call rides the app's authenticated helper — `api` from
 * @/shared/api/client with the session JWT — like every other call of the app.
 *
 * WHAT ARRIVES IS AN AGGREGATE. The server's own function holds the numbers, it
 * is service_role only, and no user id and no item id ever leaves it: the chart
 * sees counts, never a person.
 */

import { api, getActivePageJwt } from "@/shared/api/client";

/** One trained model: the registry's row, with its offline metrics. */
export interface RecsHealthModel {
  id: number | string;
  createdAt?: string | null;
  status?: string | null;
  isSynthetic?: boolean;
  eventsUsed?: number | null;
  ndcg10?: number | null;
  recall20?: number | null;
}

/** One day of what was served: what the impression beacon logged. */
export interface RecsHealthDay {
  day: string;
  isSynthetic?: boolean;
  impressions?: number | null;
  clicks?: number | null;
}

/** The whole chart: the models, the days, and the window they cover. */
export interface RecsHealth {
  since?: string | null;
  models: RecsHealthModel[];
  daily: RecsHealthDay[];
}

const jwt = () => getActivePageJwt() ?? undefined;

/**
 * The health of the recommender: every trained model of the window, and every
 * day of click-through. The window is the server's default (a month) unless the
 * caller asks for another one.
 */
export async function fetchRecsHealth(days?: number): Promise<RecsHealth> {
  const query = days === undefined ? "" : `?days=${encodeURIComponent(String(days))}`;
  const res = await api.get<RecsHealth>(`/api/admin/recs/health${query}`, jwt());
  return {
    since: res?.since ?? null,
    models: Array.isArray(res?.models) ? res.models : [],
    daily: Array.isArray(res?.daily) ? res.daily : [],
  };
}

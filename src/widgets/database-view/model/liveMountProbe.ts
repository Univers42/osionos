/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   liveMountProbe.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 03:40:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 03:40:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { api, getActivePageJwt } from "@/shared/api/client";
import type { LiveMountProbe } from "./liveMountProbeLabels";

export { describeProbe } from "./liveMountProbeLabels";
export type { LiveMountProbe, ProbeLabels, ProbeTone } from "./liveMountProbeLabels";

const CACHE_TTL_MS = 60_000;
const probeCache = new Map<string, { value: Promise<LiveMountProbe>; expiresAt: number }>();

/** Live engine and transport metadata, cached briefly per mount. */
export function getLiveMountProbe(dbId: string): Promise<LiveMountProbe> {
  const cached = probeCache.get(dbId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = api.get<LiveMountProbe>(`/api/databases/${dbId}/probe`, getActivePageJwt() ?? undefined)
    .catch((error: unknown) => {
      probeCache.delete(dbId);
      throw error;
    });
  probeCache.set(dbId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

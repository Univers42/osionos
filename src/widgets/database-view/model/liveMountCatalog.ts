/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   liveMountCatalog.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/09 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/09 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Discovery of the registered live mounts via the BRIDGE: `GET {VITE_API_URL}
 * /api/databases` (bearer app-session JWT). The bridge proxies the tenant's
 * adapter-registry server-side and returns `{databases:[{dbId,name,engine}]}`.
 * The browser CANNOT hit Kong's `/admin/v1/databases` directly — the anon key
 * 401s on that route (and a service key must never reach the browser).
 *
 * ONLINE (the bridge is configured — `API_BASE` set) the registry is the ONLY
 * source of truth: a failure THROWS so the panel can show WHY, and we NEVER
 * silently degrade to the partial `VITE_BAAS_LIVE_MOUNTS` mock set (that masked
 * a broken registry as "3 databases"). The env mounts are used ONLY by the
 * truly offline/desktop build (no bridge URL). Only non-empty results are
 * cached (60s), so a transient failure never poisons the cache.
 */

import { api, getActivePageJwt, API_BASE } from "@/shared/api/client";
import { parseMounts, type LiveMountInfo } from "./liveMountParse";

export type { LiveMountInfo } from "./liveMountParse";

const TENANT_ID = (((import.meta.env ?? {}) as Record<string, string | undefined>)
  .VITE_BAAS_TENANT_ID ?? "").trim();

const CACHE_TTL_MS = 60_000;
let mountsCache: { value: LiveMountInfo[]; expiresAt: number } | null = null;

async function fetchRegistryMounts(): Promise<LiveMountInfo[]> {
  // No try/catch: a registry failure (401/503/network) MUST propagate so the
  // panel surfaces it, instead of silently degrading to the mock env mounts.
  // The bridge resolves the tenant server-side; ?tenant= is only a hint.
  const qs = TENANT_ID ? `?tenant=${encodeURIComponent(TENANT_ID)}` : "";
  const response = await api.get<{ databases?: unknown }>(`/api/databases${qs}`, getActivePageJwt() ?? undefined);
  return parseMounts(response?.databases ?? []);
}

/** Offline/desktop edition only — no bridge to reach, so use the env JSON. */
function envFallbackMounts(): LiveMountInfo[] {
  const raw = ((import.meta.env ?? {}) as Record<string, string | undefined>).VITE_BAAS_LIVE_MOUNTS;
  if (!raw) return [];
  try {
    return parseMounts(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Every registered database for the tenant. Online: registry via the bridge is
 *  authoritative and throws on failure (no mock fallback). Offline: env mounts. */
export async function listLiveMounts(): Promise<LiveMountInfo[]> {
  if (mountsCache && mountsCache.expiresAt > Date.now()) return mountsCache.value;
  if (!API_BASE) return envFallbackMounts(); // truly offline (no bridge URL)
  const registryMounts = await fetchRegistryMounts(); // throws on registry error
  if (registryMounts.length > 0) {
    mountsCache = { value: registryMounts, expiresAt: Date.now() + CACHE_TTL_MS };
  }
  return registryMounts;
}

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
 * Discovery of the registered live mounts: `GET {VITE_BAAS_URL}/admin/v1/
 * databases` (Kong → adapter-registry; the Go handler returns an array of
 * TenantDatabase `{id, tenant_id, engine, name, created_at, …}`). Parsing is
 * defensive — only `{id|dbId, name?, engine?}` is consumed. When the registry
 * route is unavailable, the `VITE_BAAS_LIVE_MOUNTS` env JSON
 * (`[{"dbId":"…","name":"…","engine":"postgresql"}]`) is the fallback; every
 * failure degrades silently to []. Cached 60s.
 */

import { BAAS_BASE_URL, baasConfigured, baasHeaders } from "@/features/second-brain/baas/baasFetch";

/** One registered mount, ready to be combined with its tables into
 *  `baas:<dbId>:<table>` database ids. */
export interface LiveMountInfo {
  dbId: string;
  name: string;
  engine: string;
}

const CACHE_TTL_MS = 60_000;
let mountsCache: { value: LiveMountInfo[]; expiresAt: number } | null = null;

function parseMounts(payload: unknown): LiveMountInfo[] {
  if (!Array.isArray(payload)) return [];
  const mounts: LiveMountInfo[] = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const dbId = typeof record.id === "string" && record.id
      ? record.id
      : typeof record.dbId === "string" ? record.dbId : "";
    if (!dbId) continue;
    mounts.push({
      dbId,
      name: typeof record.name === "string" && record.name ? record.name : dbId,
      engine: typeof record.engine === "string" && record.engine ? record.engine : "unknown",
    });
  }
  return mounts;
}

async function fetchRegistryMounts(): Promise<LiveMountInfo[]> {
  if (!baasConfigured()) return [];
  try {
    const response = await fetch(`${BAAS_BASE_URL}/admin/v1/databases`, { headers: baasHeaders() });
    if (!response.ok) return [];
    return parseMounts(await response.json());
  } catch {
    return [];
  }
}

function envFallbackMounts(): LiveMountInfo[] {
  const raw = ((import.meta.env ?? {}) as Record<string, string | undefined>).VITE_BAAS_LIVE_MOUNTS;
  if (!raw) return [];
  try {
    return parseMounts(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Registered mounts (registry first, env fallback, [] on failure; 60s cache). */
export async function listLiveMounts(): Promise<LiveMountInfo[]> {
  if (mountsCache && mountsCache.expiresAt > Date.now()) return mountsCache.value;
  const registryMounts = await fetchRegistryMounts();
  const value = registryMounts.length > 0 ? registryMounts : envFallbackMounts();
  mountsCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

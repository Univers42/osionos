/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tenantConsoleClient.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Self-service control transport for `/v1/tenants/me*`. Unlike the query-router
 * client (`baasFetch.ts`, two-header `X-Baas-Api-Key`), this surface accepts a
 * single `Authorization: Bearer mbk_…`. All config is env-driven; when unset the
 * console stays dormant (`consoleConfigured()` → false).
 */

import type {
  ApiKey,
  IssueKeyResponse,
  MeResponse,
  PlanChangeResponse,
  UsageResponse,
} from "./tenantConsoleTypes";

// `?? {}` so the module is import-safe outside Vite (e.g. node:test).
const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
const API_KEY = (env.VITE_BAAS_API_KEY ?? "").trim();
const EXPLICIT = (env.VITE_BAAS_CONSOLE_URL ?? "").trim().replace(/\/$/, "");
const QUERY_URL = (env.VITE_BAAS_URL ?? "").trim().replace(/\/$/, "");
const BASE_URL = EXPLICIT || (QUERY_URL ? `${QUERY_URL}/v1/tenants/me` : "");

/** True when the console base URL + a tenant bearer key are configured. */
export function consoleConfigured(): boolean {
  return Boolean(BASE_URL && API_KEY);
}

/** A failed self-service call, carrying the HTTP status + the server's text. */
export class TenantConsoleError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "TenantConsoleError";
  }
}

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new TenantConsoleError(response.status, text || `Console ${path} failed: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** The self-service console API surface (one method per server route). */
export const tenantConsoleClient = {
  getSelf: () => request<MeResponse>("", "GET"),
  getUsage: () => request<UsageResponse>("/usage", "GET"),
  listKeys: () => request<ApiKey[]>("/keys", "GET"),
  createKey: (name: string, scopes?: string[]) =>
    request<IssueKeyResponse>("/keys", "POST", scopes ? { name, scopes } : { name }),
  revokeKey: (id: string) => request<void>(`/keys/${encodeURIComponent(id)}`, "DELETE"),
  changePlan: (plan: string) => request<PlanChangeResponse>("", "PATCH", { plan }),
};

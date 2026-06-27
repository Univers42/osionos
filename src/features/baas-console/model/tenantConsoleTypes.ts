/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tenantConsoleTypes.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Local mirrors of the BaaS self-service wire shapes (`/v1/tenants/me*`). We do
 * NOT import the SDK — osionos rolls its own fetch — so these types are the
 * single source of truth for the console feature. Shapes follow the shared
 * coder contract; the authoritative JSON lives in the SDK
 * (apps/grobase/sdks/js/src/{domains,types}.ts).
 */

/** The calling tenant, as returned by the self-service surface. */
export interface MeTenant {
  id: string;
  uuid: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
}

/** What the calling tenant's current plan grants. */
export interface Entitlements {
  package: string;
  engines: string[];
  capabilities: Record<string, boolean>;
  limits: Record<string, unknown>;
  quota?: unknown;
}

/** Response of GET /v1/tenants/me — tenant + entitlements. */
export interface MeResponse {
  tenant: MeTenant;
  entitlements: Entitlements;
}

/** One metered metric, aggregated over the usage window. */
export interface MetricAgg {
  metric: string;
  qty: number;
  window_count: number;
}

/** Response of GET /v1/tenants/me/usage — windowed metered usage. */
export interface UsageResponse {
  tenant_id: string;
  window: { from: string; to: string };
  metrics: MetricAgg[];
  total_qty: number;
}

/** Redacted API-key view (the full key is only returned once, on issue). */
export interface ApiKey {
  id: string;
  tenant_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  expires_at?: string | null;
  last_used_at?: string | null;
  revoked_at?: string | null;
}

/** Issued key response — carries the cleartext `key` exactly once. */
export interface IssueKeyResponse extends ApiKey {
  key: string;
}

/** Response of PATCH /v1/tenants/me {plan} — the updated tenant + new package. */
export interface PlanChangeResponse {
  tenant: MeTenant;
  package: string;
}

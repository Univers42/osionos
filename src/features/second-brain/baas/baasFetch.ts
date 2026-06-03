/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   baasFetch.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Shared transport for the BaaS query-router (`/query/v1/*`). Two-header auth:
 * `X-Baas-Api-Key` for the tenant (+ optional Kong `apikey`). Used by both the
 * read client (`baasGraphClient`) and the write client (`baasTxnClient`). All
 * config is env-driven; when unset the feature stays dormant (local-only).
 */

// `?? {}` so the module is import-safe outside Vite (e.g. node:test), where
// `import.meta.env` is undefined.
const env = (import.meta.env ?? {}) as Record<string, string | undefined>;

export const BAAS_BASE_URL = (env.VITE_BAAS_URL ?? "").trim().replace(/\/$/, "");
const API_KEY = (env.VITE_BAAS_API_KEY ?? "").trim();
const KONG_KEY = (env.VITE_BAAS_KONG_KEY ?? "").trim();

/** True when the base URL + tenant key are configured. */
export function baasConfigured(): boolean {
  return Boolean(BAAS_BASE_URL && API_KEY);
}

export function baasHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Baas-Api-Key": API_KEY,
  };
  if (KONG_KEY) headers.apikey = KONG_KEY;
  return headers;
}

/** A failed BaaS call, carrying the HTTP status + the server's own message. */
export class BaasError extends Error {
  // Plain field (not a TS parameter property) so node --experimental-strip-types
  // can load this module in unit tests.
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "BaasError";
  }

  /** A 409 means the caller's request conflicts (e.g. duplicate id) — their
   *  fault, not a gateway failure (txn-contract: 409 vs the old opaque 502). */
  get isConflict(): boolean {
    return this.status === 409;
  }
}

export async function baasPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BAAS_BASE_URL}${path}`, {
    method: "POST",
    headers: baasHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    const message = payload?.message ?? payload?.error ?? `BaaS ${path} failed: ${response.status}`;
    throw new BaasError(response.status, message);
  }
  return (await response.json()) as T;
}

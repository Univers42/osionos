/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   patApi.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Developer panel's client calls, one function per route of
// scripts/bridge-account-tokens.mjs. They go through the shared `api` client with
// the page JWT (the bridge's app-session token), so the sudo and revoked-session
// seams of that client apply. The parsers never throw on a malformed body: a bad
// row is dropped, a missing secret is said out loud.

import { api, getActivePageJwt } from "@/shared/api/client";
import type { PatCatalog, PatGrant, PatKind, PatToken, CreateTokenBody } from "./patModel";

const TOKENS_PATH = "/api/account/tokens";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_SECRET = "The token was created but its secret was not returned. Revoke it and create it again.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const textOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);

function parseGrant(value: unknown): PatGrant | null {
  if (!isRecord(value) || typeof value.resource !== "string") return null;
  return { resource: value.resource, attributes: strings(value.attributes), permissions: strings(value.permissions) };
}

/** One token entry, or null when it has no uuid. Only the nine contract keys are kept. */
function parseToken(value: unknown): PatToken | null {
  if (!isRecord(value) || typeof value.id !== "string" || !UUID.test(value.id)) return null;
  const kind: PatKind = value.kind === "fine_grained" ? "fine_grained" : "classic";
  const grants = Array.isArray(value.grants) ? value.grants.map(parseGrant).filter((grant): grant is PatGrant => grant !== null) : [];
  return {
    id: value.id, name: typeof value.name === "string" ? value.name : "", kind,
    scopes: strings(value.scopes), grants,
    createdAt: textOrNull(value.createdAt), expiresAt: textOrNull(value.expiresAt), revokedAt: textOrNull(value.revokedAt), lastUsedAt: textOrNull(value.lastUsedAt),
  };
}

function parseCatalog(value: unknown): PatCatalog {
  const resources: PatCatalog["resources"] = {};
  if (isRecord(value) && isRecord(value.resources)) {
    for (const [name, entry] of Object.entries(value.resources)) {
      if (isRecord(entry)) resources[name] = { attributes: strings(entry.attributes) };
    }
  }
  return { resources, permissions: isRecord(value) ? strings(value.permissions) : [] };
}

export function parseTokenList(body: unknown): { tokens: PatToken[]; catalog: PatCatalog } {
  const record = isRecord(body) ? body : {};
  const rows = Array.isArray(record.tokens) ? record.tokens : [];
  return { tokens: rows.map(parseToken).filter((token): token is PatToken => token !== null), catalog: parseCatalog(record.catalog) };
}

export function parseCreated(body: unknown): { token: PatToken; secret: string } {
  const record = isRecord(body) ? body : {};
  const token = parseToken(record.token);
  if (!token || typeof record.secret !== "string" || record.secret === "") throw new Error(NO_SECRET);
  return { token, secret: record.secret };
}

function jwt(): string | undefined {
  return getActivePageJwt() ?? undefined;
}

export async function listTokens(): Promise<{ tokens: PatToken[]; catalog: PatCatalog }> {
  return parseTokenList(await api.get<unknown>(TOKENS_PATH, jwt()));
}

export async function createToken(body: CreateTokenBody): Promise<{ token: PatToken; secret: string }> {
  return parseCreated(await api.post<unknown>(TOKENS_PATH, body, jwt()));
}

export async function revokeToken(id: string): Promise<void> {
  await api.delete<unknown>(`${TOKENS_PATH}/${encodeURIComponent(id)}`, jwt());
}

export async function revokeAllTokens(): Promise<void> {
  await api.delete<unknown>(TOKENS_PATH, jwt());
}

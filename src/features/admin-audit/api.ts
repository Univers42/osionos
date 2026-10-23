/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   api.ts                                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client of the audit viewer API (scripts/bridge-account-audit.mjs).
 *
 * Every event is rebuilt here field by field, so a column the bridge should not have sent
 * (an ip_hash, a user agent) cannot reach the store. Details keep only scalar values.
 */

import { api, getActivePageJwt } from "@/shared/api/client";

export interface AuditEvent {
  id: string;
  createdAt: string;
  eventType: string;
  actorId: string | null;
  subject: string | null;
  details: Record<string, string>;
}

export interface AuditPage {
  events: AuditEvent[];
  nextCursor: string | null;
}

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

function toDetails(raw: unknown): Record<string, string> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") out[key] = String(value);
    else if (Array.isArray(value)) out[key] = value.map(String).join(", ");
  }
  return out;
}

function toEvent(raw: Record<string, unknown>): AuditEvent {
  return {
    id: String(raw.id ?? ""),
    createdAt: text(raw.createdAt) ?? "",
    eventType: text(raw.eventType) ?? "",
    actorId: text(raw.actorId),
    subject: text(raw.subject),
    details: toDetails(raw.details),
  };
}

/** One keyset page. Caveat: a malformed row is kept with empty fields rather than dropped, so a
 *  bridge bug shows as a blank row instead of a silently shorter list. */
export async function listAuditEvents({ cursor, limit, eventType }: { cursor?: string | null; limit: number; eventType?: string }): Promise<AuditPage> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  if (eventType) query.set("eventType", eventType);
  const res = await api.get<{ events?: Record<string, unknown>[]; nextCursor?: string | null }>(
    `/api/account/admin/audit?${query}`,
    getActivePageJwt() ?? undefined,
  );
  return {
    events: Array.isArray(res?.events) ? res.events.map(toEvent) : [],
    nextCursor: typeof res?.nextCursor === "string" && res.nextCursor ? res.nextCursor : null,
  };
}

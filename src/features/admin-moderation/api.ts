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
 * The client of the moderation queue API (scripts/bridge-account-moderation.mjs).
 *
 * Every report is rebuilt here field by field, so a column the panel must not show (a reporter's
 * id or email, if a bridge ever sent one) cannot reach the store. Nothing is cached.
 */

import { api, getActivePageJwt } from "@/shared/api/client";

const REPORTS = "/api/account/admin/reports";

export type ReportStatus = "open" | "reviewing" | "resolved" | "dismissed";
export type ReportDecision = "warn" | "suspend" | "ban" | "dismiss";

export interface AdminReport {
  id: string;
  subjectUserId: string | null;
  subjectName: string | null;
  subjectKind: string;
  category: string;
  details: string | null;
  status: string;
  decision: string | null;
  decisionUntil: string | null;
  createdAt: string;
}

export interface AdminReportsPage {
  reports: AdminReport[];
  nextCursor: string | null;
}

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

function toReport(raw: Record<string, unknown>): AdminReport {
  return {
    id: String(raw.id ?? ""),
    subjectUserId: text(raw.subjectUserId),
    subjectName: text(raw.subjectName),
    subjectKind: text(raw.subjectKind) ?? "user",
    category: text(raw.category) ?? "other",
    details: text(raw.details),
    status: text(raw.status) ?? "open",
    decision: text(raw.decision),
    decisionUntil: text(raw.decisionUntil),
    createdAt: text(raw.createdAt) ?? "",
  };
}

/** One keyset page. Caveat: a malformed row is kept with empty fields rather than dropped, so a
 *  bridge bug shows as a blank row instead of a silently shorter queue. */
export async function listAdminReports({ status, cursor, limit }: { status: ReportStatus; cursor?: string | null; limit: number }): Promise<AdminReportsPage> {
  const query = new URLSearchParams({ status, limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  const res = await api.get<{ reports?: Record<string, unknown>[]; nextCursor?: string | null }>(`${REPORTS}?${query}`, getActivePageJwt() ?? undefined);
  return {
    reports: Array.isArray(res?.reports) ? res.reports.map(toReport) : [],
    nextCursor: typeof res?.nextCursor === "string" && res.nextCursor ? res.nextCursor : null,
  };
}

/** Only a suspension carries `until`; the bridge refuses one on any other decision. */
export async function decideReport(id: string, { decision, until }: { decision: ReportDecision; until?: string }): Promise<void> {
  const body = decision === "suspend" ? { decision, until } : { decision };
  await api.post(`${REPORTS}/${encodeURIComponent(id)}/decision`, body, getActivePageJwt() ?? undefined);
}

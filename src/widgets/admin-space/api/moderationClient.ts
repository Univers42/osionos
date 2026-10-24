/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   moderationClient.ts                                 :+:      :+:    :+:   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client of the moderation console: what an admin reviews (the held
 * comments, the open reports) and what an admin decides (hide, restore,
 * dismiss, resolve).
 *
 * The three calls ride the app's authenticated helper — `api` from
 * @/shared/api/client with the session JWT — like every other call of the app.
 *
 * NOTHING IS CACHED HERE. The queue is what the server says now, and the
 * content of a comment comes from the item route, which is the route that
 * audits the reading (C92). A caller that keeps the content anywhere else
 * keeps a copy of a user's words the audit knows nothing about.
 */

import { api, getActivePageJwt } from "@/shared/api/client";

/** The two comment surfaces the console reviews, and the report kind. */
export type ModerationKind = "feed_comment" | "page_comment";
export type ModerationTarget = ModerationKind | "report";

/** What an admin may do. */
export type ModerationDecision = "hide" | "restore" | "dismiss" | "resolve";

/** The closed list of reasons an admin may give. */
export type ModerationReason =
  | "spam"
  | "harassment"
  | "hate"
  | "sexual"
  | "violence"
  | "self_harm"
  | "illegal"
  | "other"
  | "report_unfounded";

/** One row of the audit: what happened to a subject, and who did it. */
export interface ModerationAuditRow {
  ts?: string | null;
  layer?: string | null;
  action?: string | null;
  reason?: string | null;
  scores?: Record<string, unknown> | null;
}

/** A held comment, as the queue shows it: never its content. */
export interface HeldComment {
  subjectKind: ModerationKind;
  id: string;
  authorId?: string | null;
  createdAt?: string | null;
  moderationChangedAt?: string | null;
  audit?: ModerationAuditRow | null;
}

/** A report, as the queue shows it. */
export interface ModerationReport {
  id: string;
  reporterId?: string | null;
  subjectKind?: string;
  subjectId?: string;
  subjectUserId?: string;
  category?: string;
  details?: string;
  status?: string;
  createdAt?: string;
}

/** The whole queue: the reports to read, and the comments to decide. */
export interface ModerationQueue {
  reports: ModerationReport[];
  held: HeldComment[];
}

/** The item: the content of one comment, and the audit that says what happened to it. */
export interface ModerationItem {
  content: string;
  state: string;
  authorId?: string | null;
  createdAt?: string | null;
  audit: ModerationAuditRow[];
}

const jwt = () => getActivePageJwt() ?? undefined;

/** The queue: what the server has now. */
export async function fetchQueue(): Promise<ModerationQueue> {
  const res = await api.get<ModerationQueue>("/api/admin/moderation/queue", jwt());
  return {
    reports: Array.isArray(res?.reports) ? res.reports : [],
    held: Array.isArray(res?.held) ? res.held : [],
  };
}

/** The content of one comment — and the reading is audited by the server. */
export async function fetchItem(kind: ModerationKind, id: string): Promise<ModerationItem> {
  const res = await api.get<ModerationItem>(
    `/api/admin/moderation/item?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`,
    jwt(),
  );
  return {
    content: res?.content ?? "",
    state: res?.state ?? "visible",
    authorId: res?.authorId ?? null,
    createdAt: res?.createdAt ?? null,
    audit: Array.isArray(res?.audit) ? res.audit : [],
  };
}

/** A decision: what the admin did, and why. */
export async function decide(input: {
  kind: ModerationTarget;
  id: string;
  decision: ModerationDecision;
  reason?: ModerationReason;
}): Promise<void> {
  await api.post("/api/admin/moderation/decision", input, jwt());
}

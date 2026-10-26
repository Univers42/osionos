/**
 * The "earlier messages" notice of a thread, as data.
 *
 * Two facts say turns fell out of the window the assistant reads: the summary
 * the transcript carries, and the `context.truncated` frame of the latest run.
 * This module turns them into the one notice the thread shows.
 *
 * The service adds `summary` to the transcript only when its flag is on, so an
 * absent key (`undefined`) is "flag off", which is not the same as `null`
 * ("on, nothing summarised yet").
 *
 * Caveat: a malformed `summary` reads as absent, so the notice hides rather
 * than shows something half-understood; the service never sends one.
 */

import type { ConversationSummary } from "@/features/ai/api/aiWire";

export { summaryFromBody } from "@/features/ai/api/aiWire";
export type { ConversationSummary };

/** What the latest run said about its window. */
export interface TruncatedFrame {
  summarized: boolean;
}

export type SummaryNotice = "none" | "summarised" | "beyond";

/** The payload of a `context.truncated` frame, or null when it is not one. */
export function truncatedFromEvent(data: Record<string, unknown>): TruncatedFrame | null {
  return typeof data.summarized === "boolean" ? { summarized: data.summarized } : null;
}

/** Which notice the thread shows. */
export function noticeOf(summary: ConversationSummary | null | undefined, truncated: TruncatedFrame | null): SummaryNotice {
  if (summary || truncated?.summarized) return "summarised";
  return truncated ? "beyond" : "none";
}

/** The moment a summary reaches, in the reader's locale; the raw text when it is not a date. */
export function throughLabel(through: string, locale?: string): string {
  const moment = new Date(through);
  return Number.isNaN(moment.getTime()) ? through : moment.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

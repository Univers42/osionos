/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   moderationCopy.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What a failed moderation call says to the moderator. The bridge's codes are stable, its
 * messages are not meant for people, so each code gets its own sentence and an unknown failure
 * a generic one. A raw code or an exception text is never shown.
 *
 * Caveat: the 429 sentence cannot name the wait: the shared http client drops the body's
 * retryAfterSeconds, so it says "a minute", the bridge's window.
 */

const BY_CODE = {
  moderator_required: "Only moderators can use the moderation queue. Your access may have changed: reload the page.",
  self_report: "You cannot decide a report you filed. Ask another moderator to take it.",
  self_subject: "You cannot decide a report about yourself. Ask another moderator to take it.",
  target_is_admin: "An administrator cannot be moderated from here.",
  decision_downgrade: "This person already has a stronger live ban or suspension. It can only be dismissed or made stronger.",
  invalid_decision: "That is not a decision the queue knows: choose warn, suspend, ban or dismiss.",
  invalid_until: "A suspension needs an end date within the next 30 days; the other decisions take none.",
  invalid_subject: "This report names no person, so there is nobody to decide on.",
  admin_check_unavailable: "The person could not be checked, so nothing was changed. Try again in a moment.",
  decision_saved_revoke_failed: "The decision was saved, but the person's sessions could not be ended yet. The queue is re-read below; repeat the decision to end them.",
  decision_saved_notify_failed: "The decision was saved, but the warning could not be delivered to the person. The queue is re-read below.",
  invalid_status: "That status is not one the queue knows. Choose another.",
  invalid_cursor: "The queue moved while you were reading it. Reload to continue.",
  invalid_note: "The note must be text of at most 500 characters.",
  invalid_report_id: "That report could not be found. Reload the queue.",
  invalid_body: "The decision could not be understood. Reload the page and try again.",
  report_not_found: "This report no longer exists. Reload the queue.",
  rate_limited: "You are going too fast. Wait a minute, then try again.",
} as const satisfies Record<string, string>;

export const MODERATION_CODES = Object.keys(BY_CODE) as (keyof typeof BY_CODE)[];

const GENERIC = "Something went wrong. Try again, and reload the page if it keeps happening.";

export function moderationErrorCopy(error: unknown): string {
  const { code, status } = (error ?? {}) as { code?: unknown; status?: unknown };
  if (typeof code === "string" && Object.hasOwn(BY_CODE, code)) return BY_CODE[code as keyof typeof BY_CODE];
  if (status === 429) return BY_CODE.rate_limited;
  if (status === 403) return BY_CODE.moderator_required;
  return GENERIC;
}

/** The decision is already stored when the bridge answers one of these. */
export const isSavedDecision = (error: unknown): boolean =>
  typeof (error as { code?: unknown })?.code === "string" && (error as { code: string }).code.startsWith("decision_saved_");

export const SUSPEND_NEEDS_END = "A suspension needs an end date within the next 30 days.";

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   moderationWarning.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * L0's warning — the ONE capability every client that writes public text needs.
 *
 * The bridge (scripts/bridge-moderation-gate.mjs) asks the author BEFORE a
 * public-facing write when the text may hurt someone: it answers 409 with
 * `{ ok:false, code:'moderation_warning', message, reasons, terms,
 * details:{ reasons, terms } }` and writes NOTHING. The author answers with
 * `acknowledgeWarning: true`, and the write goes through.
 *
 * This module is where that answer is understood, so every client reads the
 * same one: the type, and `warningFrom` — the only place that knows what a
 * moderation warning looks like on the wire. The notice the author sees lives
 * beside it, in ModerationWarningNotice.tsx.
 *
 * C94: the matched TERMS are the author's own words. They belong to the
 * author's screen and to nothing else — never to a log line, never to an
 * audit row.
 */

export interface ModerationWarning {
  code: "moderation_warning";
  message: string;
  reasons: string[];
  terms: string[];
}

/** The 409 the bridge answers when L0 wants the author's answer first. */
export function warningFrom(error: unknown): ModerationWarning | null {
  const candidate = error as { status?: number; code?: string; message?: string; details?: unknown } | null;
  if (!candidate || candidate.status !== 409 || candidate.code !== "moderation_warning") return null;
  const details = (candidate.details ?? {}) as { reasons?: unknown; terms?: unknown };
  return {
    code: "moderation_warning",
    message: candidate.message ?? "This may hurt someone. Edit it, or post it anyway.",
    reasons: Array.isArray(details.reasons) ? details.reasons.map(String) : [],
    terms: Array.isArray(details.terms) ? details.terms.map(String) : [],
  };
}

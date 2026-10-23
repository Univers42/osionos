/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ReportCard.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * One report of the moderation queue: who it is about and the four decisions. A suspension takes
 * an end date (at most 30 days out), a ban takes none. It shows the target's display name only:
 * the route sends no reporter identity and no session of the target.
 */

import React, { useState } from "react";

import type { AdminReport, ReportDecision } from "@/features/admin-moderation/api";
import { SettingRow } from "@/features/settings/ui/settingsKit";
import { Button } from "@/shared/ui";

export interface ReportCardProps {
  report: AdminReport;
  busy: boolean;
  error: string;
  onDecide: (id: string, decision: ReportDecision, until?: string) => void;
}

const DAY_MS = 86_400_000;
const MAX_DAYS = 30;
const fieldClass = "h-[var(--osio-control-h-md)] rounded-[var(--osio-control-radius)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-3 text-sm text-[var(--osio-fg-default)]";

const dateOnly = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The end of the chosen UTC day, held under the 30-day cap. Caveat: on the last allowed day the
 *  suspension ends up to a day earlier than the date says, never later; the store and the bridge
 *  check the cap again. */
export function untilFromDate(date: string, now = Date.now()): string | undefined {
  if (!date) return undefined;
  const end = Date.parse(`${date}T23:59:59.000Z`);
  if (Number.isNaN(end)) return undefined;
  return new Date(Math.min(end, now + MAX_DAYS * DAY_MS - 60_000)).toISOString();
}

const describe = (report: AdminReport): string =>
  [report.category, report.subjectKind === "user" ? "person" : report.subjectKind, report.details, report.decision ? `decided: ${report.decision}` : null]
    .filter(Boolean).join(" · ");

export const ReportCard: React.FC<ReportCardProps> = ({ report, busy, error, onDecide }) => {
  const [date, setDate] = useState("");
  const [now] = useState(Date.now);
  const inputId = `suspend-until-${report.id}`;
  const decide = (decision: ReportDecision) => onDecide(report.id, decision, decision === "suspend" ? untilFromDate(date) : undefined);
  return (
    <>
      <SettingRow
        title={report.subjectName || "Unnamed user"}
        description={describe(report)}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button disabled={busy} onClick={() => decide("warn")}>Warn</Button>
            <Button disabled={busy} onClick={() => decide("suspend")}>Suspend</Button>
            <Button tone="danger" disabled={busy} onClick={() => decide("ban")}>Ban</Button>
            <Button disabled={busy} onClick={() => decide("dismiss")}>Dismiss</Button>
          </div>
        }
      />
      <label htmlFor={inputId} className="mb-2 flex flex-wrap items-center gap-2 text-sm text-[var(--osio-fg-muted)]">
        Suspend until
        <input id={inputId} type="date" className={fieldClass} value={date} min={dateOnly(now)} max={dateOnly(now + MAX_DAYS * DAY_MS)} onChange={(event) => setDate(event.target.value)} />
      </label>
      {error ? <p role="alert" className="pb-3 text-sm text-[var(--osio-danger)]">{error}</p> : null}
    </>
  );
};

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ModerationPanel.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Moderation section of the Admin space: the reports filed about people, by status, with
 * Warn / Suspend / Ban / Dismiss on each. Affordance only: the bridge re-reads the moderator role
 * on every request and refuses what the role or the target forbids; each refusal is shown in words.
 */

import React, { useEffect } from "react";
import { ShieldAlert } from "lucide-react";

import type { AdminReport, ReportDecision, ReportStatus } from "@/features/admin-moderation/api";
import { useModerationQueueStore } from "@/features/admin-moderation/useModerationQueueStore";
import { EmptyState, PanelStatus, Section } from "@/features/settings/ui/settingsKit";
import { Button } from "@/shared/ui";
import { ReportCard } from "./ReportCard";

export interface ModerationPanelViewProps {
  reports: AdminReport[];
  status: ReportStatus;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  hasMore: boolean;
  rowErrors: Record<string, string>;
  busyId: string | null;
  onStatus: (status: ReportStatus) => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onDecide: (id: string, decision: ReportDecision, until?: string) => void;
}

const STATUSES: readonly ReportStatus[] = ["open", "reviewing", "resolved", "dismissed"];
const fieldClass = "h-[var(--osio-control-h-md)] rounded-[var(--osio-control-radius)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-3 text-sm text-[var(--osio-fg-default)]";

export const ModerationPanelView: React.FC<ModerationPanelViewProps> = (props) => {
  const { reports, status, loading, loaded, error, hasMore, rowErrors, busyId, onStatus, onRetry, onLoadMore, onDecide } = props;
  const state = !loaded ? "loading" : reports.length === 0 && error ? "error" : "ready";
  return (
    <Section title="Moderation" className="mt-6">
      <label className="mb-3 flex items-center gap-2 text-sm text-[var(--osio-fg-muted)]">
        Status
        <select className={fieldClass} value={status} onChange={(event) => onStatus(event.target.value as ReportStatus)}>
          {STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <PanelStatus status={state} error={error} onRetry={onRetry}>
        {reports.length === 0 ? (
          <EmptyState icon={<ShieldAlert size={16} />} title="No report here" hint="Reports filed about people appear in this queue." />
        ) : (
          <>
            {reports.map((report) => (
              <ReportCard key={report.id} report={report} busy={busyId === report.id} error={rowErrors[report.id] ?? ""} onDecide={onDecide} />
            ))}
            {error ? <p role="alert" className="mt-3 text-sm text-[var(--osio-danger)]">{error}</p> : null}
            {hasMore ? <Button className="mt-4" disabled={loading} onClick={onLoadMore}>{loading ? "Loading…" : "Load more"}</Button> : null}
          </>
        )}
      </PanelStatus>
    </Section>
  );
};

const ModerationPanel: React.FC = () => {
  const state = useModerationQueueStore();
  useEffect(() => { void useModerationQueueStore.getState().reload(); }, []);
  return (
    <ModerationPanelView
      reports={state.reports} status={state.status} loading={state.loading} loaded={state.loaded} error={state.error}
      hasMore={state.nextCursor !== null} rowErrors={state.rowErrors} busyId={state.busyId}
      onStatus={(next) => void state.setStatus(next)} onRetry={() => void state.reload()} onLoadMore={() => void state.loadMore()}
      onDecide={(id, decision, until) => void state.decide(id, decision, until)}
    />
  );
};

export default ModerationPanel;

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AuditPanel.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Audit section of the Admin space: a table of the bridge's audit events, newest first.
 * Details are rendered as `key: value` text lines through React's escaping, never as HTML.
 * Affordance only: the bridge re-reads the admin role on every request.
 */

import React, { useEffect } from "react";
import { History } from "lucide-react";

import { useAuditStore } from "@/features/admin-audit/useAuditStore";
import type { AuditEvent } from "@/features/admin-audit/api";
import { DataTable, EmptyState, PanelStatus, Section } from "@/features/settings/ui/settingsKit";
import { Button } from "@/shared/ui";

export interface AuditPanelViewProps {
  events: AuditEvent[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  hasMore: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
}

const HEADERS = ["Time", "Actor", "Event", "Details"];

function stamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

const toRow = (event: AuditEvent): React.ReactNode[] => [
  <time key={event.id} dateTime={event.createdAt} className="text-xs text-[var(--osio-fg-muted)]">{stamp(event.createdAt)}</time>,
  <span key="actor" className="break-all text-xs">{event.actorId ?? "system"}</span>,
  <span key="type" className="break-words text-xs font-medium">{event.eventType}</span>,
  <div key="details" className="space-y-0.5 break-words text-xs text-[var(--osio-fg-muted)]">
    {Object.entries(event.details).map(([key, value]) => <div key={key}>{`${key}: ${value}`}</div>)}
  </div>,
];

export const AuditPanelView: React.FC<AuditPanelViewProps> = ({ events, loading, loaded, error, hasMore, onRetry, onLoadMore }) => {
  const status = !loaded ? "loading" : events.length === 0 && error ? "error" : "ready";
  return (
    <Section title="Audit" className="mt-6">
      <PanelStatus status={status} error={error} onRetry={onRetry}>
        {events.length === 0 ? (
          <EmptyState icon={<History size={16} />} title="No audit event yet" hint="Sensitive actions are recorded here as they happen." />
        ) : (
          <>
            <DataTable headers={HEADERS} rows={events.map(toRow)} />
            {error ? <p role="alert" className="mt-3 text-sm text-[var(--osio-danger)]">{error}</p> : null}
            {hasMore ? <Button className="mt-4" disabled={loading} onClick={onLoadMore}>{loading ? "Loading…" : "Load more"}</Button> : null}
          </>
        )}
      </PanelStatus>
    </Section>
  );
};

const AuditPanel: React.FC = () => {
  const state = useAuditStore();
  useEffect(() => { void useAuditStore.getState().reload(); }, []);
  return (
    <AuditPanelView
      events={state.events} loading={state.loading} loaded={state.loaded} error={state.error}
      hasMore={state.nextCursor !== null} onRetry={() => void state.reload()} onLoadMore={() => void state.loadMore()}
    />
  );
};

export default AuditPanel;

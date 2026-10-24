/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   InsightsPanel.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Insights section of the Admin space: platform-wide activity, per day, as a chart and as
 * the same numbers in a table. It shows aggregates only; the bridge stores no group of fewer
 * than 5 people and re-reads the admin role on every request. Affordance only: the server is
 * the gate.
 */

import React, { useCallback, useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { DAY_CHOICES, eventsPerDay, fetchInsights, type DayChoice, type Insights } from "@/features/admin-insights/api";
import { DataTable, EmptyState, PanelStatus, Section } from "@/features/settings/ui/settingsKit";
import { Dropdown } from "@/shared/ui";

const PRIVACY_NOTE = "Groups with fewer than 5 people are never shown.";
const TICK = { fontSize: 11, fill: "var(--osio-fg-subtle)" };
const HEADERS = ["Day", "Event", "Surface", "Events", "People"];
const DAY_OPTIONS = DAY_CHOICES.map((value) => ({ value: String(value), label: `Last ${value} days` }));

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; insights: Insights };

export interface InsightsPanelViewProps {
  load: Load;
  days: DayChoice;
  onDays: (days: DayChoice) => void;
  onRetry: () => void;
}

const toRow = (cell: Insights["cells"][number], index: number): React.ReactNode[] => [
  <span key={`d${index}`} className="text-xs">{cell.day}</span>,
  <span key={`e${index}`} className="text-xs font-medium">{cell.event}</span>,
  <span key={`s${index}`} className="text-xs">{cell.surface}</span>,
  <span key={`n${index}`} className="text-xs tabular-nums">{cell.events}</span>,
  <span key={`u${index}`} className="text-xs tabular-nums">{cell.users}</span>,
];

const PerDayChart: React.FC<{ insights: Insights }> = ({ insights }) => {
  const points = eventsPerDay(insights.cells);
  return (
    <div role="img" aria-label={`Events per day, ${points.length} days, ${insights.totalOfShownCells} events in total`} className="h-56 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--osio-border-soft)" vertical={false} />
          <XAxis dataKey="day" tick={TICK} tickFormatter={(value: string) => value.slice(5)} minTickGap={16} />
          <YAxis tick={TICK} allowDecimals={false} width={40} />
          <Tooltip />
          <Bar dataKey="events" name="Events" fill="var(--osio-accent)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const Result: React.FC<{ insights: Insights }> = ({ insights }) => {
  if (insights.cells.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={16} />}
        title="No activity to show yet"
        hint="Nothing has been recorded for this period, or every group in it is smaller than 5 people."
      />
    );
  }
  return (
    <div className="space-y-4">
      <PerDayChart insights={insights} />
      <p className="text-sm text-[var(--osio-fg-muted)]">{`${insights.totalOfShownCells} events in the groups shown.`}</p>
      <DataTable headers={HEADERS} rows={insights.cells.map(toRow)} />
    </div>
  );
};

export const InsightsPanelView: React.FC<InsightsPanelViewProps> = ({ load, days, onDays, onRetry }) => (
  <Section title="Insights" className="mt-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-[220px] flex-1 text-sm text-[var(--osio-fg-muted)]">{PRIVACY_NOTE}</p>
      <Dropdown label="Period" value={String(days)} options={DAY_OPTIONS} onChange={(value) => onDays(Number(value) as DayChoice)} align="end" width="auto" />
    </div>
    <PanelStatus status={load.status} error={load.status === "error" ? load.message : null} onRetry={onRetry}>
      {load.status === "ready" ? <Result insights={load.insights} /> : null}
    </PanelStatus>
  </Section>
);

const InsightsPanel: React.FC = () => {
  const [days, setDays] = useState<DayChoice>(30);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchInsights(days).then(
      (insights) => { if (alive) setLoad({ status: "ready", insights }); },
      (error: unknown) => { if (alive) setLoad({ status: "error", message: error instanceof Error ? error.message : "The request failed." }); },
    );
    return () => { alive = false; };
  }, [days, attempt]);

  // The skeleton is set where the request is asked for, not in the effect that sends it.
  const reload = useCallback(() => { setLoad({ status: "loading" }); setAttempt((n) => n + 1); }, []);
  const chooseDays = useCallback((next: DayChoice) => { setLoad({ status: "loading" }); setDays(next); }, []);
  return <InsightsPanelView load={load} days={days} onDays={chooseDays} onRetry={reload} />;
};

export default InsightsPanel;

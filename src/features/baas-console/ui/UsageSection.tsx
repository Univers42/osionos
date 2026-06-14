/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   UsageSection.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect } from 'react';
import { Activity } from 'lucide-react';
import type { MetricAgg } from '../model/tenantConsoleTypes';
import { useTenantConsoleStore } from '../model/useTenantConsoleStore';
import { ConsoleSection, ConsoleRow, ConsoleEmpty } from './consolePrimitives';

const CELL = { flex: 1, minWidth: 0 };
const MUTED = { color: 'var(--osio-fg-muted)' };

function fmtWindow(value?: string) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

/** One metered metric: name + aggregate qty + count of windows seen. */
function MetricRow({ agg }: { agg: MetricAgg }) {
  return (
    <ConsoleRow>
      <span style={{ ...CELL, fontWeight: 600 }}>{agg.metric}</span>
      <span style={{ ...CELL, textAlign: 'right' }}>{agg.qty.toLocaleString()}</span>
      <span style={{ ...CELL, ...MUTED, textAlign: 'right' }}>{agg.window_count.toLocaleString()} windows</span>
    </ConsoleRow>
  );
}

/** Usage section: fetches on mount, renders per-metric rows + a grand total. */
export function UsageSection() {
  const usage = useTenantConsoleStore((s) => s.usage);
  const loading = useTenantConsoleStore((s) => s.loading);
  const error = useTenantConsoleStore((s) => s.error);
  const fetchUsage = useTenantConsoleStore((s) => s.fetchUsage);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const hasMetrics = Boolean(usage && usage.metrics.length > 0);

  return (
    <ConsoleSection title="Usage" icon={<Activity size={16} aria-hidden />}>
      {error ? <p style={{ color: 'var(--osio-fg-danger, #d33)' }}>{error}</p> : null}
      {usage ? (
        <p style={{ ...MUTED, margin: '0 0 8px' }}>
          {fmtWindow(usage.window.from)} → {fmtWindow(usage.window.to)}
        </p>
      ) : null}
      {!hasMetrics ? (
        <ConsoleEmpty>{loading ? 'Loading usage…' : 'No metered usage in this window.'}</ConsoleEmpty>
      ) : (
        <>
          {usage!.metrics.map((agg) => <MetricRow key={agg.metric} agg={agg} />)}
          <ConsoleRow>
            <span style={{ ...CELL, fontWeight: 700 }}>Total</span>
            <span style={{ ...CELL, textAlign: 'right', fontWeight: 700 }}>
              {usage!.total_qty.toLocaleString()}
            </span>
            <span style={{ ...CELL }} aria-hidden />
          </ConsoleRow>
        </>
      )}
    </ConsoleSection>
  );
}

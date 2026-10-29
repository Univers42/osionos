/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsKit.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useState } from 'react';
import { Button, Card, IconValueView, MiniTabs as PrimitiveMiniTabs } from '@/shared/ui';

const rowBorder = 'border-t border-[var(--osio-border-default)]';

function anchorFromTitle(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('&', '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

export const Section: React.FC<{ title: string; anchor?: string; children: React.ReactNode; className?: string }> = ({ title, anchor, children, className = '' }) => (
  <section className={`space-y-4 ${className}`} data-settings-anchor={anchor ?? anchorFromTitle(title)}>
    {/* h2 (not h3): the tab view's heading is the h1, so the document outline keeps no gap. */}
    {/* font-sans: the base heading rule is serif; only the page h1 keeps it. */}
    <h2 className="font-sans text-base font-semibold text-[var(--osio-fg-default)]">{title}</h2>
    <div>{children}</div>
  </section>
);

export const SettingRow: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  stack?: boolean;
  danger?: boolean;
}> = ({ title, description, action, stack = false, danger = false }) => (
  <div className={`flex w-full gap-3 py-3 ${rowBorder} ${stack ? 'flex-col items-start' : 'flex-wrap items-center justify-between'}`}>
    <div className="min-w-[220px] flex-1">
      <div className={`text-sm font-medium ${danger ? 'text-[var(--osio-danger)]' : 'text-[var(--osio-fg-default)]'}`}>{title}</div>
      {description && <div className="mt-1 text-sm leading-[18px] text-[var(--osio-fg-muted)]">{description}</div>}
    </div>
    {action && <div className="flex shrink-0 items-center justify-end gap-2">{action}</div>}
  </div>
);

export const DataTable: React.FC<{ headers: string[]; rows: React.ReactNode[][]; empty?: React.ReactNode; className?: string }> = ({ headers, rows, empty, className = '' }) => {
  // The empty state is its own bordered card; inside the 560px table it was clipped and double-framed on a phone.
  if (rows.length === 0 && empty) return <div className={`min-w-0 w-full ${className}`}>{empty}</div>;
  return (
  <div className={`overflow-x-auto rounded-[var(--osio-radius-panel)] border border-[var(--osio-db-line)] ${className}`}>
    <table className="w-full min-w-[560px] table-fixed text-sm">
      <thead className="bg-[var(--osio-bg-subtle)] text-left text-xs font-medium text-[var(--osio-fg-muted)]">
        <tr>{headers.map((header) => <th key={header} className="border-b border-[var(--osio-db-line)] px-3 py-2">{header}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-[var(--osio-db-line-soft)]">
        {rows.map((row) => {
          const firstCell = row[0];
          const rowKey = React.isValidElement(firstCell) && firstCell.key ? String(firstCell.key) : row.map(String).join('|');
          return (
          <tr key={rowKey} className="hover:bg-[var(--osio-bg-hover)]">
            {row.map((cell, cellIndex) => <td key={`${rowKey}-${cellIndex}`} className="px-3 py-2 align-middle text-[var(--osio-fg-default)]">{cell}</td>)}
          </tr>
          );
        })}
      </tbody>
    </table>
  </div>
  );
};

export const MiniTabs: React.FC<{ tabs: Array<{ label: string; count?: number }>; active?: string; onChange?: (value: string) => void }> = ({ tabs, active, onChange }) => {
  const options = useMemo(() => tabs.map((tab) => ({ value: tab.label, label: tab.label, count: tab.count })), [tabs]);
  const [value, setValue] = useState(active ?? options[0]?.value ?? '');
  if (options.length === 0) return null;
  const selectedValue = active ?? value;
  const safeValue = options.some((option) => option.value === selectedValue) ? selectedValue : options[0].value;
  return <PrimitiveMiniTabs value={safeValue} options={options} onChange={(next) => { setValue(next); onChange?.(next); }} />;
};

export const Avatar: React.FC<{ value?: string; label?: string; size?: number }> = ({ value = '👤', label, size = 28 }) => (
  <span aria-label={label} className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)]" style={{ width: size, height: size }}>
    <IconValueView value={value} size={Math.max(16, size - 8)} />
  </span>
);

export const FeatureCard: React.FC<{ icon?: React.ReactNode; title: string; description: string; action?: React.ReactNode; className?: string }> = ({ icon, title, description, action, className }) => (
  <Card className={className}>
    <div className="flex flex-wrap items-start gap-3">
      {icon && <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--osio-bg-subtle)] text-[var(--osio-accent)]">{icon}</span>}
      <div className="min-w-0 flex-1 basis-48">
        <h4 className="font-sans text-sm font-semibold text-[var(--osio-fg-default)]">{title}</h4>
        <p className="mt-1 text-sm leading-[18px] text-[var(--osio-fg-muted)]">{description}</p>
      </div>
      {action && <div className="shrink-0 max-sm:basis-full">{action}</div>}
    </div>
  </Card>
);

/** What a panel is doing with its data right now. */
export type PanelStatusState = 'loading' | 'ready' | 'error';

/** Three rows, so the panel keeps its shape while it loads. */
const SKELETON_ROWS = [0, 1, 2];

/** The pulse of the skeleton rows: the app's motion tokens, and the global
 *  reduced-motion reset (the person's own choice, then the OS one) stops it. */
const pulse = 'animate-pulse [animation-duration:var(--osio-dur-slow)] [animation-timing-function:var(--osio-ease-standard)]';

/**
 * The skeleton of a loading panel: rows the height of a SettingRow.
 */
const PanelSkeleton: React.FC = () => (
  <div aria-busy="true" className="w-full">
    <span className="sr-only">Loading…</span>
    {SKELETON_ROWS.map((row) => (
      <div key={row} aria-hidden="true" className={`flex w-full gap-3 py-3 ${rowBorder}`}>
        <div className="min-w-[220px] flex-1 space-y-2">
          <div className={`h-5 w-1/3 rounded-md bg-[var(--osio-bg-subtle)] ${pulse}`} />
          <div className={`h-4 w-2/3 rounded-md bg-[var(--osio-bg-subtle)] ${pulse}`} />
        </div>
        <div className={`h-[var(--osio-control-h-md)] w-24 shrink-0 rounded-[var(--osio-control-radius)] bg-[var(--osio-bg-subtle)] ${pulse}`} />
      </div>
    ))}
  </div>
);

/**
 * The three states a settings panel is in, in one place: the panels read them,
 * they never draw their own.
 */
export const PanelStatus: React.FC<{
  status: PanelStatusState;
  error?: string | null;
  onRetry?: () => void;
  children?: React.ReactNode;
}> = ({ status, error, onRetry, children }) => {
  if (status === 'loading') return <PanelSkeleton />;
  if (status === 'error') {
    return (
      <div role="alert" className="rounded-[var(--osio-radius-panel)] border border-[var(--osio-danger)] bg-[var(--osio-bg-subtle)] p-4">
        <div className="text-sm font-medium text-[var(--osio-danger)]">{"Couldn't load these settings"}</div>
        <p className="mt-1 text-sm leading-[18px] text-[var(--osio-fg-muted)]">{error || 'These settings could not be loaded.'}</p>
        {onRetry && <Button className="mt-3" onClick={onRetry}>Retry</Button>}
      </div>
    );
  }
  return <>{children}</>;
};

/**
 * What a panel shows when it has nothing to show: no fake row, no blank
 * space. The icon tile is the one FeatureCard uses.
 */
export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon, title, hint, action, className = '' }) => (
  <div className={`flex flex-col items-center justify-center gap-3 rounded-[var(--osio-radius-panel)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-6 py-10 text-center ${className}`}>
    {icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--osio-bg-subtle)] text-[var(--osio-accent)]">{icon}</span>}
    <div className="space-y-1">
      <div className="text-sm font-medium text-[var(--osio-fg-default)]">{title}</div>
      {hint && <p className="text-sm leading-[18px] text-[var(--osio-fg-muted)]">{hint}</p>}
    </div>
    {action}
  </div>
);

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
import { Card, IconValueView, MiniTabs as PrimitiveMiniTabs } from '@/shared/ui';

const rowBorder = 'border-t border-[var(--osio-border-default)]';

function anchorFromTitle(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('&', '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

export const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <section className={`space-y-4 ${className}`} data-settings-anchor={anchorFromTitle(title)}>
    {/* h2 (not h3): the tab view's heading is the h1, so the document outline keeps no gap. */}
    <h2 className="text-base font-medium text-[var(--osio-fg-default)]">{title}</h2>
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

export const DataTable: React.FC<{ headers: string[]; rows: React.ReactNode[][]; className?: string }> = ({ headers, rows, className = '' }) => (
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
    <div className="flex items-start gap-3">
      {icon && <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--osio-bg-subtle)] text-[var(--osio-accent)]">{icon}</span>}
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-medium text-[var(--osio-fg-default)]">{title}</h4>
        <p className="mt-1 text-sm leading-[18px] text-[var(--osio-fg-muted)]">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  </Card>
);

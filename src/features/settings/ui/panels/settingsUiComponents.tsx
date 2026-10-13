/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsUiComponents.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 20:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 20:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useState } from 'react';
import { Dropdown, MiniTabs as PrimitiveMiniTabs, Toggle } from '@osionos/ui/primitives';
import { IconValueView } from '@/shared/ui';

export const rowBorder = 'border-b border-[var(--osio-border-default)]';

export function anchorFromTitle(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('&', '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

export function textFromReactNode(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textFromReactNode).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return textFromReactNode(node.props.children);
  }
  return '';
}

export function noopHandledAction(name: string, payload?: unknown) {
  // Deliberate UI telemetry/stub seam.
  void name;
  void payload;
}

export function runAsync(promise: Promise<unknown>) {
  promise.catch((error: unknown) => {
    console.error('[settings]', error);
  });
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadText(fileName: string, content: string, type = 'text/plain') {
  downloadBlob(fileName, new Blob([content], { type }));
}

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'default' | 'primary' | 'danger' | 'ghost' }> = ({ className = '', tone = 'default', onClick, children, ...props }) => {
  const toneClass = {
    default: 'border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-[var(--osio-fg-default)] hover:border-[var(--osio-border-strong)] hover:bg-[var(--osio-bg-hover)]',
    primary: 'bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] shadow-[var(--osio-e1)] hover:bg-[var(--osio-accent-hover)] hover:shadow-[var(--osio-e2)]',
    danger: 'bg-[var(--osio-danger)]/10 text-[var(--osio-danger)] hover:bg-[var(--osio-danger)]/15',
    ghost: 'text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]',
  }[tone];

  const label = textFromReactNode(children) || props['aria-label'] || 'button';
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    if (onClick) {
      onClick(event);
      return;
    }
    noopHandledAction('settings_button_click', { label });
  };

  return <button type="button" className={`inline-flex h-[var(--osio-control-h-md)] select-none items-center justify-center gap-1.5 rounded-[var(--osio-radius-control)] px-3 text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--osio-dur-fast)] ease-[var(--osio-ease-standard)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--osio-bg-page)] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 ${toneClass} ${className}`} onClick={handleClick} {...props}>{children}</button>;
};

export const SelectButton: React.FC<{
  children: React.ReactNode;
  value?: string;
  options?: Array<{ value: string; label: string }>;
  onChange?: (value: string) => void;
}> = ({ children, value, options: providedOptions, onChange }) => {
  const label = textFromReactNode(children) || 'Select';
  const [localValue, setLocalValue] = useState(value ?? label);
  const options = useMemo(() => providedOptions ?? [
    { value: label, label },
    { value: 'Default', label: 'Default' },
    { value: 'Off', label: 'Off' },
  ].filter((option, index, array) => array.findIndex((candidate) => candidate.value === option.value) === index), [label, providedOptions]);
  const selectedValue = value ?? localValue;

  return <Dropdown value={selectedValue} options={options} onChange={(next) => { setLocalValue(next); if (onChange) onChange(next); else noopHandledAction('settings_select_change', { label, value: next }); }} align="end" width="auto" />;
};

export const Switch: React.FC<{ checked?: boolean; label?: string; onChange?: (checked: boolean) => void }> = ({ checked = false, label, onChange }) => {
  const [localValue, setLocalValue] = useState(checked);
  const value = onChange ? checked : localValue;
  return <Toggle checked={value} onChange={(next) => { if (!onChange) { setLocalValue(next); noopHandledAction('settings_toggle_change', { label, value: next }); } onChange?.(next); }} label={label} />;
};

export const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <section className={`space-y-4 ${className}`} data-settings-anchor={anchorFromTitle(title)}>
    <h3 className="border-b border-[var(--osio-border-default)] pb-3 text-base font-medium text-[var(--osio-fg-default)]">{title}</h3>
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
  <div className={`overflow-x-auto rounded-lg border border-[var(--osio-db-line)] ${className}`}>
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

export const FeatureCard: React.FC<{ icon?: React.ReactNode; title: string; description: string; action?: React.ReactNode }> = ({ icon, title, description, action }) => (
  <div className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4">
    <div className="flex items-start gap-3">
      {icon && <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--osio-bg-subtle)] text-[var(--osio-accent)]">{icon}</span>}
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-medium text-[var(--osio-fg-default)]">{title}</h4>
        <p className="mt-1 text-sm leading-[18px] text-[var(--osio-fg-muted)]">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  </div>
);

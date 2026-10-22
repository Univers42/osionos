/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SettingsRows.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The two rows every settings section is made of.
 *
 * They were private to SettingsCenter.tsx, which made them impossible to
 * reuse: a panel that lives in its own file (the personalization switch, the
 * social panels) had to copy them, and a copy drifts. They live here now, so
 * one row is one row — the settings screen and the panels that sit in it
 * share the same line, the same border and the same anchor.
 */

import React from 'react';

const rowBorder = 'border-t border-[var(--osio-border-default)]';

/** The anchor of a section: its title, slugged. */
function anchorFromTitle(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('&', '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

export const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <section className={`space-y-4 ${className}`} data-settings-anchor={anchorFromTitle(title)}>
    <h3 className="text-base font-medium text-[var(--osio-fg-default)]">{title}</h3>
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

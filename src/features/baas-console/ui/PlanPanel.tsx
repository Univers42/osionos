/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PlanPanel.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';

import { useTenantConsoleStore } from '../model/useTenantConsoleStore';
import { ConsoleSection, ConsoleButton, ConsoleEmpty } from './consolePrimitives';

/** Manifest order of the known plan tiers (server validates the change). */
const PLAN_TIERS = ['nano', 'basic', 'essential', 'pro', 'max'] as const;

/**
 * "Plan" panel: lists the five tiers as selectable options, highlights the
 * tenant's current plan, and lets the user PATCH it via the store. The store
 * re-hydrates `me` on success, so the highlight follows the new plan; a failed
 * change surfaces the store `error`. Mirrors `PATCH /v1/tenants/me {plan}`.
 */
export function PlanPanel() {
  const me = useTenantConsoleStore((s) => s.me);
  const loading = useTenantConsoleStore((s) => s.loading);
  const error = useTenantConsoleStore((s) => s.error);
  const changePlan = useTenantConsoleStore((s) => s.changePlan);

  const current = me?.tenant.plan ?? null;
  const [pending, setPending] = useState<string | null>(null);
  const selected = pending ?? current;

  if (me === null) {
    return (
      <ConsoleSection title="Plan">
        {loading
          ? <ConsoleEmpty>Loading…</ConsoleEmpty>
          : <ConsoleEmpty>{error ?? 'No tenant connected.'}</ConsoleEmpty>}
      </ConsoleSection>
    );
  }

  const unchanged = selected === current;

  return (
    <ConsoleSection title="Plan">
      <div className="grid gap-2 sm:grid-cols-2">
        {PLAN_TIERS.map((tier) => {
          const isCurrent = tier === current;
          const isSelected = tier === selected;
          return (
            <button
              type="button"
              key={tier}
              disabled={loading}
              onClick={() => setPending(tier)}
              className={`flex items-center justify-between rounded-md border p-3 text-left text-sm transition disabled:opacity-60 ${
                isSelected
                  ? 'border-[var(--osio-accent)] bg-[var(--osio-bg-subtle)] font-medium text-[var(--osio-fg-default)]'
                  : 'border-[var(--osio-border-default)] text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]'
              }`}
            >
              <span className="capitalize">{tier}</span>
              {isCurrent && (
                <span className="text-[11px] uppercase tracking-wide text-[var(--osio-fg-subtle)]">current</span>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mt-2 text-xs text-[var(--osio-danger)]">{error}</p>
      )}

      <div className="mt-3 flex justify-end">
        <ConsoleButton
          tone="primary"
          disabled={loading || unchanged || selected === null}
          onClick={() => { if (selected) void changePlan(selected); }}
        >
          {loading ? 'Changing…' : 'Change plan'}
        </ConsoleButton>
      </div>
    </ConsoleSection>
  );
}

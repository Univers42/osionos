/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TenantAccountSection.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';

import { Badge, type BadgeTone } from '@/shared/ui';
import { useTenantConsoleStore } from '../model/useTenantConsoleStore';
import type { Entitlements } from '../model/tenantConsoleTypes';
import { ConsoleSection, ConsoleRow, ConsoleEmpty } from './consolePrimitives';

/** Map a tenant status string to a Badge tone (active → success, else default). */
function statusTone(status: string): BadgeTone {
  const normalized = status.toLowerCase();
  if (normalized === 'active') return 'success';
  if (normalized === 'suspended' || normalized === 'disabled') return 'danger';
  return 'default';
}

/** The enabled capability keys, rendered as a compact comma list. */
function enabledCapabilities(entitlements: Entitlements): string {
  const enabled = Object.entries(entitlements.capabilities)
    .filter(([, on]) => on)
    .map(([name]) => name);
  return enabled.length ? enabled.join(', ') : 'none';
}

/** A short, deterministic summary of the entitlement limits map. */
function limitsSummary(entitlements: Entitlements): string {
  const entries = Object.entries(entitlements.limits);
  if (!entries.length) return 'none';
  return entries
    .map(([name, value]) => `${name}: ${String(value)}`)
    .join(' · ');
}

/**
 * Read-only "Account" panel for the calling tenant: identity, status, current
 * plan, and an entitlement summary (package, engines, enabled capabilities,
 * limits). Pure display — no mutations. Mirrors `GET /v1/tenants/me`.
 */
export function TenantAccountSection() {
  const me = useTenantConsoleStore((s) => s.me);
  const loading = useTenantConsoleStore((s) => s.loading);
  const error = useTenantConsoleStore((s) => s.error);

  if (me === null) {
    return (
      <ConsoleSection title="Account">
        {loading
          ? <ConsoleEmpty>Loading…</ConsoleEmpty>
          : <ConsoleEmpty>{error ?? 'No tenant connected.'}</ConsoleEmpty>}
      </ConsoleSection>
    );
  }

  const { tenant, entitlements } = me;

  return (
    <ConsoleSection title="Account">
      <ConsoleRow label="Name" value={tenant.name} />
      <ConsoleRow label="Slug (id)" value={tenant.slug || tenant.id} />
      <ConsoleRow label="UUID" value={tenant.uuid} />
      <ConsoleRow label="Status" value={<Badge tone={statusTone(tenant.status)}>{tenant.status}</Badge>} />
      <ConsoleRow label="Plan" value={<Badge tone="accent">{tenant.plan}</Badge>} />
      <ConsoleRow label="Package" value={entitlements.package} />
      <ConsoleRow
        label="Engines"
        value={entitlements.engines.length ? entitlements.engines.join(', ') : 'none'}
      />
      <ConsoleRow label="Capabilities" value={enabledCapabilities(entitlements)} />
      <ConsoleRow label="Limits" value={limitsSummary(entitlements)} />
    </ConsoleSection>
  );
}

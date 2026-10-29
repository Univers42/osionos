/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SessionsSettings.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect } from 'react';
import { MonitorSmartphone } from 'lucide-react';

import { useAccountDevicesStore } from '@/store/settings';
import type { SessionRow } from '@/store/settings/types';
import { Button } from '@/shared/ui';
import { runAsync } from '../model/settingsCalls';
import { DataTable, EmptyState, PanelStatus, Section, SettingRow } from '../ui/settingsKit';
import { CLIENT_KIND_LABELS, deviceName, groupSessions } from './sessionClient';

const HEADERS = ['Device', 'Signed in', 'Network', 'Sign-in method', ''];

const sentenceCase = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ') : 'Unknown');

function sessionCells(row: SessionRow, onRevoke: (id: string) => void): React.ReactNode[] {
  const name = deviceName(row.userAgent);
  return [
    <span key={`${row.id}-name`}>
      {name}
      {row.current && <span className="ml-2 rounded-xs bg-[var(--osio-accent-subtle)] px-1.5 py-0.5 text-xs text-[var(--osio-accent-text)]">This device</span>}
    </span>,
    new Date(row.createdAt).toLocaleString(),
    row.ipPrefix ?? 'Unknown network',
    sentenceCase(row.authMethod),
    <Button key={`${row.id}-revoke`} aria-label={`Revoke session: ${name}${row.current ? ' (this device)' : ''}`} onClick={() => onRevoke(row.id)}>Revoke</Button>,
  ];
}

const Groups: React.FC<{ rows: SessionRow[]; onRevoke: (id: string) => void }> = ({ rows, onRevoke }) => {
  if (rows.length === 0) return <EmptyState icon={<MonitorSmartphone size={16} />} title="No other sessions" hint="Sessions you start on other devices show up here." />;
  return (
    <div className="space-y-5">
      {groupSessions(rows).map((group) => (
        <div key={group.kind} className="space-y-2" data-sessions-group={group.kind}>
          <h3 className="text-sm font-medium text-[var(--osio-fg-default)]">{CLIENT_KIND_LABELS[group.kind]}</h3>
          <DataTable headers={HEADERS} rows={group.rows.map((row) => sessionCells(row, onRevoke))} />
        </div>
      ))}
    </div>
  );
};

/**
 * The Profile panel's Sessions block: the sessions the bridge reports, grouped web, desktop and
 * mobile, one Revoke per row, and the existing "log out of all devices" action.
 *
 * Caveat: revoking ends the session and its refresh, but credentials already minted from it (the
 * IDE token, live-room grants) run out on their own; the copy says "a few minutes", not "at once".
 */
export const SessionsSettings: React.FC<{ userId: string; onSignOutAll: () => void }> = ({ userId, onSignOutAll }) => {
  const rows = useAccountDevicesStore((state) => state.data);
  const status = useAccountDevicesStore((state) => state.status);
  const error = useAccountDevicesStore((state) => state.error);
  const hydrate = useAccountDevicesStore((state) => state.hydrate);
  const revoke = useAccountDevicesStore((state) => state.revoke);

  useEffect(() => { runAsync(hydrate(userId)); }, [hydrate, userId]);

  return (
    <Section title="Sessions">
      <SettingRow danger title="Log out of all devices" description="Sign out of every session on all your devices, including this one." action={<Button tone="danger" onClick={onSignOutAll}>Log out of all devices</Button>} />
      <p className="py-3 text-sm leading-[18px] text-[var(--osio-fg-muted)]">
        Revoking a session signs that device out. Tools it already opened can keep working for a few minutes. Up to the 50 most recent devices are listed.
      </p>
      {status === 'unavailable'
        ? <EmptyState icon={<MonitorSmartphone size={16} />} title="Sessions can't be listed on this server" hint="This server doesn't keep a session list yet. Log out of all devices still works." />
        : (
          <PanelStatus status={status === 'error' ? 'error' : status === 'loading' ? 'loading' : 'ready'} error={error} onRetry={() => runAsync(hydrate(userId))}>
            <Groups rows={rows} onRevoke={(id) => runAsync(revoke(id))} />
          </PanelStatus>
        )}
    </Section>
  );
};

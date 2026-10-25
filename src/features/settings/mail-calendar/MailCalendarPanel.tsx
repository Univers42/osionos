/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MailCalendarPanel.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import { CalendarDays } from 'lucide-react';

import { useConnectionsStore } from '@/store/settings';
import { Button, Modal } from '@/shared/ui';
import { ConfirmModal } from '../ui/ConfirmModals';
import { DataTable, EmptyState, PanelStatus, Section, SettingRow } from '../ui/settingsKit';
import { runAsync } from '../model/settingsCalls';
import { useSettingsHydration } from '../model/settingsHydration';
import type { ConnectionRecord } from '@/store/settings';

const CONNECTION_PROVIDERS = [
  { provider: 'chartbase', label: 'ChartBase', scopes: ['content.read'] },
  { provider: 'slack', label: 'Slack', scopes: ['links.preview', 'messages.notify'] },
  { provider: 'github', label: 'GitHub', scopes: ['links.preview', 'databases.sync'] },
  { provider: 'whimsical', label: 'Whimsical', scopes: ['files.preview'] },
  { provider: 'adobe-xd', label: 'Adobe XD', scopes: ['files.preview'] },
  { provider: 'mail', label: 'osionos Mail', scopes: ['mail.read'] },
  { provider: 'calendar', label: 'osionos Calendar', scopes: ['calendar.read'] },
] as const;

function connectionProvider(provider: string) {
  return CONNECTION_PROVIDERS.find((item) => item.provider === provider) ?? CONNECTION_PROVIDERS[0];
}

// A mail or calendar row shows the account it was added for; without a signed-in
// persona there is no address to show, so the label stays bare.
function accountSuffix(email: string | undefined) {
  return email ? ` · ${email}` : '';
}

function providerConnectionInput(userId: string, provider: string, labelSuffix = '') {
  const manifest = connectionProvider(provider);
  return {
    userId,
    provider: manifest.provider,
    label: `${manifest.label}${labelSuffix}`,
    scopes: [...manifest.scopes],
  };
}

type SettingsModalName = 'mail-provider' | 'calendar-provider';

interface ActiveSettingsModal {
  name: SettingsModalName;
  payload?: Record<string, unknown>;
}

export const MailCalendarPanel: React.FC<{ activeUserId: string; personaEmail?: string }> = ({ activeUserId, personaEmail }) => {
  const userId = activeUserId || 'anonymous';
  const connections = useConnectionsStore((state) => state.data);
  const hydrate = useConnectionsStore((state) => state.hydrate);
  const connect = useConnectionsStore((state) => state.connect);
  const disconnect = useConnectionsStore((state) => state.disconnect);
  const [modal, setModal] = useState<ActiveSettingsModal | null>(null);
  const [leaving, setLeaving] = useState<ConnectionRecord | null>(null);

  const hydration = useSettingsHydration(async () => {
    await hydrate(userId, personaEmail);
    const failure = useConnectionsStore.getState().error;
    if (failure) throw new Error(failure);
  }, [hydrate, personaEmail, userId]);

  const mailConnections = connections.filter((connection) => connection.provider === 'mail' && !connection.removedAt);
  const calendarConnections = connections.filter((connection) => connection.provider === 'calendar' && !connection.removedAt);
  const calendarRows = calendarConnections.map((connection) => [connection.label.split(' · ')[0] ?? connection.label, connection.label.split(' · ')[1] ?? '—', connection.status]);

  return (
    <PanelStatus status={hydration.status} error={hydration.error} onRetry={hydration.retry}>
      <Section title="Connected emails">
        {mailConnections.map((connection) => <SettingRow key={connection._id} title={connection.label.split(' · ')[0]} description={connection.label.split(' · ')[1]} action={<Button tone="danger-subtle" onClick={() => setLeaving(connection)}>Disconnect</Button>} />)}
        <Button onClick={() => setModal({ name: 'mail-provider' })}>Add address</Button>
      </Section>
      <Section title="Connected calendars">
        <DataTable headers={['Calendar', 'Account', 'Status']} rows={calendarRows} empty={<EmptyState icon={<CalendarDays size={16} />} title="No calendars connected yet" hint="Add a calendar to see its events in osionos." />} />
        <Button className="mt-4" onClick={() => setModal({ name: 'calendar-provider' })}>Add calendar</Button>
      </Section>
      {modal?.name === 'mail-provider' && <ProviderPickerModal title="Mail provider" providers={['mail']} onSelect={(provider) => { runAsync(connect(providerConnectionInput(userId, provider, accountSuffix(personaEmail)))); setModal(null); }} onClose={() => setModal(null)} />}
      {modal?.name === 'calendar-provider' && <ProviderPickerModal title="Calendar provider" providers={['calendar']} onSelect={(provider) => { runAsync(connect(providerConnectionInput(userId, provider, accountSuffix(personaEmail)))); setModal(null); }} onClose={() => setModal(null)} />}
      {leaving && (
        <ConfirmModal
          title={`Disconnect ${leaving.label.split(' · ')[0]}?`}
          message="It stops syncing with osionos. You can add it again at any time."
          actionLabel="Disconnect"
          danger
          onConfirm={() => disconnect(leaving._id)}
          onClose={() => setLeaving(null)}
        />
      )}
    </PanelStatus>
  );
};

const ProviderPickerModal: React.FC<{ title: string; providers: string[]; onSelect: (provider: string) => void; onClose: () => void }> = ({ title, providers, onSelect, onClose }) => (
  <Modal open onClose={onClose} title={title} size="sm">
    <div className="grid gap-2 p-6">
      {providers.map((provider) => {
        const manifest = connectionProvider(provider);
        return <Button key={provider} onClick={() => onSelect(provider)}>{manifest.label}</Button>;
      })}
    </div>
  </Modal>
);

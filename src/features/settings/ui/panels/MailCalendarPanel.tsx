/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MailCalendarPanel.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 20:39:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 20:39:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useState } from 'react';
import { Modal } from '@osionos/ui/primitives';
import { useConnectionsStore } from '@/store/settings';
import {
  Button,
  DataTable,
  runAsync,
  Section,
  SettingRow,
} from './settingsUiComponents';

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

function providerConnectionInput(userId: string, provider: string, labelSuffix = '') {
  const manifest = connectionProvider(provider);
  return {
    userId,
    provider: manifest.provider,
    label: `${manifest.label}${labelSuffix}`,
    scopes: [...manifest.scopes],
  };
}

export const ProviderPickerModal: React.FC<{ title: string; providers: string[]; onSelect: (provider: string) => void; onClose: () => void }> = ({ title, providers, onSelect, onClose }) => (
  <Modal open onClose={onClose} title={title} size="sm">
    <div className="grid gap-2">
      {providers.map((provider) => {
        const manifest = connectionProvider(provider);
        return <Button key={provider} onClick={() => onSelect(provider)}>{manifest.label}</Button>;
      })}
    </div>
  </Modal>
);

export const MailCalendarPanel: React.FC<{ activeUserId: string; personaEmail?: string }> = ({ activeUserId, personaEmail = 'dev.pro.photo@gmail.com' }) => {
  const userId = activeUserId || 'anonymous';
  const connections = useConnectionsStore((state) => state.data);
  const hydrate = useConnectionsStore((state) => state.hydrate);
  const connect = useConnectionsStore((state) => state.connect);
  const disconnect = useConnectionsStore((state) => state.disconnect);
  const [modal, setModal] = useState<string | null>(null);

  useEffect(() => {
    runAsync(hydrate(userId, personaEmail));
  }, [hydrate, personaEmail, userId]);

  const mailConnections = connections.filter((connection) => connection.provider === 'mail' && !connection.removedAt);
  const calendarConnections = connections.filter((connection) => connection.provider === 'calendar' && !connection.removedAt);
  const calendarRows = calendarConnections.map((connection) => [connection.label.split(' · ')[0] ?? connection.label, personaEmail, connection.status]);

  return (
    <>
      <Section title="Connected emails">
        {mailConnections.map((connection) => <SettingRow key={connection._id} title={connection.label.split(' · ')[0]} description={connection.label.split(' · ')[1] ?? personaEmail} action={<Button tone="danger" onClick={() => runAsync(disconnect(connection._id))}>Disconnect</Button>} />)}
        <Button onClick={() => setModal('mail-provider')}>Add address</Button>
      </Section>
      <Section title="Connected calendars">
        <DataTable headers={['Calendar', 'Account', 'Status']} rows={calendarRows.length ? calendarRows : [['osionos Calendar', personaEmail, 'Not connected']]} />
        <Button className="mt-4" onClick={() => setModal('calendar-provider')}>Add calendar</Button>
      </Section>
      {modal === 'mail-provider' && <ProviderPickerModal title="Mail provider" providers={['mail', 'slack']} onSelect={(provider) => { runAsync(connect(providerConnectionInput(userId, provider, ` · ${personaEmail}`))); setModal(null); }} onClose={() => setModal(null)} />}
      {modal === 'calendar-provider' && <ProviderPickerModal title="Calendar provider" providers={['calendar', 'github']} onSelect={(provider) => { runAsync(connect(providerConnectionInput(userId, provider, ` · ${personaEmail}`))); setModal(null); }} onClose={() => setModal(null)} />}
    </>
  );
};

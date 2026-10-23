/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ContactsPanel.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Settings panel: accepted connections + pending incoming/outgoing requests. */

import React, { useState } from 'react';
import { Users } from 'lucide-react';

import { Button } from '@/shared/ui';
import { PeopleHovercard } from '../people/PeoplePeek';
import { RequestsInbox } from '@/features/connections/RequestsInbox';
import { useContactsStore } from '@/store/social/useContactsStore';
import type { ContactEdge } from '@/store/social/types';
import { ConfirmModal } from '../ui/ConfirmModals';
import { EmptyState, PanelStatus, Section, SettingRow } from '../ui/settingsKit';
import { useSettingsHydration } from '../model/settingsHydration';

export const ContactsPanel: React.FC = () => {
  const data = useContactsStore((state) => state.data);
  const hydrate = useContactsStore((state) => state.hydrate);
  const remove = useContactsStore((state) => state.remove);
  const [leaving, setLeaving] = useState<ContactEdge | null>(null);

  const hydration = useSettingsHydration(async () => {
    await hydrate();
    const failure = useContactsStore.getState().error;
    if (failure) throw new Error(failure);
  }, [hydrate]);

  return (
    <Section title="Your connections" anchor="connections">
      <PanelStatus status={hydration.status} error={hydration.error} onRetry={hydration.retry}>
        <RequestsInbox />
        {data.length === 0 ? (
          <EmptyState icon={<Users size={16} />} title="No connections yet" hint="People you connect with show up here." />
        ) : data.map((edge) => (
          <SettingRow
            key={edge.id}
            title={<PeopleHovercard person={edge.peer}>{edge.peer.name}</PeopleHovercard>}
            description={edge.introMessage || undefined}
            action={<Button tone="danger-subtle" onClick={() => setLeaving(edge)}>Remove</Button>}
          />
        ))}
      </PanelStatus>
      {leaving && (
        <ConfirmModal
          title={`Remove ${leaving.peer.name}?`}
          message="You will no longer be connected. They are not told, and you can send a new request later."
          actionLabel="Remove"
          danger
          onConfirm={() => remove(leaving.id)}
          onClose={() => setLeaving(null)}
        />
      )}
    </Section>
  );
};

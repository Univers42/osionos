/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PeoplePanel.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus } from 'lucide-react';

import type { StaticPersona } from '@/features/auth';
import { useWorkspaceInvitesStore, useWorkspaceMembersStore } from '@/store/settings';
import { Button } from '@/shared/ui';
import { PeopleDatabasePanel } from './PeopleDatabasePanel';
import { usePeopleCounts } from './usePeopleCounts';
import type { PeopleSourceKey } from './peopleModel';
import { MiniTabs } from '../ui/settingsKit';
import { runAsync } from '../model/settingsCalls';

type PeopleTab = { label: string; source: PeopleSourceKey };

const PEOPLE_TABS: PeopleTab[] = [
  { label: 'Contacts', source: 'contacts' },
  { label: 'Members', source: 'members' },
  { label: 'Groups', source: 'groups' },
  { label: 'Guests', source: 'guests' },
];

export const PeoplePanel: React.FC<{
  workspaceId?: string;
  activeUserId: string;
  personas: StaticPersona[];
  membersCount: number;
}> = ({ workspaceId = 'local-workspace', activeUserId, personas }) => {
  const [activeLabel, setActiveLabel] = useState('Contacts');
  const [showDirectory, setShowDirectory] = useState(false);
  const [recount, setRecount] = useState(0);
  const hydrateMembers = useWorkspaceMembersStore((state) => state.hydrate);
  const hydrateInvites = useWorkspaceInvitesStore((state) => state.hydrate);
  const seedUserIds = useMemo(() => personas.map((persona) => persona.id).filter(Boolean), [personas]);

  useEffect(() => {
    runAsync(hydrateMembers(workspaceId, activeUserId || 'anonymous', seedUserIds));
    runAsync(hydrateInvites(workspaceId));
  }, [activeUserId, hydrateInvites, hydrateMembers, seedUserIds, workspaceId]);

  const counts = usePeopleCounts(workspaceId, recount);
  const bump = useCallback(() => setRecount((value) => value + 1), []);
  const peopleCtx = useMemo(
    () => ({ workspaceId, activeUserId: activeUserId || 'anonymous', personas }),
    [workspaceId, activeUserId, personas],
  );
  const countByLabel: Record<string, number | undefined> = {
    Contacts: counts.contacts, Members: counts.members, Groups: counts.groups, Guests: counts.guests,
  };
  const activeSource = PEOPLE_TABS.find((tab) => tab.label === activeLabel)?.source ?? 'contacts';

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MiniTabs
          active={activeLabel}
          onChange={(value) => { setShowDirectory(false); setActiveLabel(value); }}
          tabs={PEOPLE_TABS.map((tab) => ({ label: tab.label, count: countByLabel[tab.label] }))}
        />
        <Button tone={showDirectory ? 'default' : 'primary'} onClick={() => setShowDirectory((open) => !open)}>
          <UserPlus size={16} /> {showDirectory ? 'Done' : 'Add members'}
        </Button>
      </div>
      <PeopleDatabasePanel key={showDirectory ? 'directory' : activeSource} source={showDirectory ? 'directory' : activeSource} ctx={peopleCtx} onCountsChange={bump} />
    </>
  );
};

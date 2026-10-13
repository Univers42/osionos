/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TeamspacesPanel.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 20:33:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 20:33:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import { Modal } from '@osionos/ui/primitives';
import { useUserStore } from '@/features/auth';
import { usePageStore } from '@/store/usePageStore';
import { recordSettingsAction, useTeamspacesStore } from '@/store/settings';
import {
  Button,
  DataTable,
  MiniTabs,
  runAsync,
  Section,
  SelectButton,
  SettingRow,
  Switch,
} from './settingsUiComponents';

// Stable empty: `?? []` inside a zustand-v5 selector returns a FRESH array each
// getSnapshot when the key is absent (new workspace) → infinite-loop blank panel.
const EMPTY_TEAMSPACES: never[] = [];

export const NewTeamspaceModal: React.FC<{ onCreate: (name: string) => void; onClose: () => void }> = ({ onCreate, onClose }) => {
  const [name, setName] = useState('New teamspace');
  return (
    <Modal open onClose={onClose} title="New teamspace" size="sm">
      <div className="space-y-4">
        <input className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={name} onChange={(event) => setName(event.target.value)} />
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone="primary" onClick={() => onCreate(name.trim() || 'New teamspace')}>Create</Button></div>
      </div>
    </Modal>
  );
};

export const TeamspacesPanel: React.FC<{ workspaceName?: string }> = ({ workspaceName = '42 school HQ' }) => {
  const workspace = useUserStore((state) => state.activeWorkspace());
  const workspaceId = workspace?._id ?? 'local-workspace';
  const activeUserId = useUserStore((state) => state.activeUserId) || 'anonymous';
  const jwt = useUserStore((state) => state.activePageJwt());
  const addPage = usePageStore((state) => state.addPage);
  const teamspaces = useTeamspacesStore((state) => state.data[workspaceId] ?? EMPTY_TEAMSPACES);
  const createTeamspace = useTeamspacesStore((state) => state.create);
  const updateTeamspace = useTeamspacesStore((state) => state.update);
  const archiveTeamspace = useTeamspacesStore((state) => state.archive);
  const [activeTab, setActiveTab] = useState('Active');
  const [modalOpen, setModalOpen] = useState(false);
  const [limitOwners, setLimitOwners] = useState(false);
  const activeTeamspaces = teamspaces.filter((teamspace) => !teamspace.archivedAt);
  const rows = activeTeamspaces.map((teamspace) => [
    <input key={`${teamspace._id}-name`} className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" defaultValue={teamspace.name} onBlur={(event) => updateTeamspace(workspaceId, teamspace._id, { name: event.target.value })} />,
    teamspace.owners.join(', ') || activeUserId,
    <SelectButton key={`${teamspace._id}-access`} value={teamspace.access} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'private', label: 'Private' }]} onChange={(value) => updateTeamspace(workspaceId, teamspace._id, { access: value as 'open' | 'closed' | 'private' })}>{teamspace.access}</SelectButton>,
    <Button key={`${teamspace._id}-archive`} tone="danger" onClick={() => archiveTeamspace(workspaceId, teamspace._id)}>Archive</Button>,
  ]);

  async function createNewTeamspace(name: string) {
    const page = await addPage(workspaceId, name, jwt ?? '', undefined, { icon: '🏛️', visibility: 'shared' });
    createTeamspace(workspaceId, { name, ownerId: activeUserId, pageId: page?._id ?? null });
  }

  return (
    <>
      <Section title="Default teamspaces"><SettingRow title={workspaceName} description="Default workspace teamspace" action={<Button onClick={() => recordSettingsAction('default_teamspace_update', { workspaceId })}>Update</Button>} /><SettingRow title="Limit teamspace creation to workspace owners" description="Allow only workspace owners to create teamspaces" action={<Switch checked={limitOwners} onChange={setLimitOwners} />} /></Section>
      <Section title="Teamspaces"><p className="mb-3 text-sm text-[var(--osio-fg-muted)]">Manage all teamspaces you have access to here.</p><MiniTabs active={activeTab} onChange={setActiveTab} tabs={[{ label: 'Active', count: activeTeamspaces.length }, { label: 'Owner' }, { label: 'Access' }, { label: 'Security' }]} /><DataTable className="mt-4" headers={['Teamspace', 'Owners', 'Access', '']} rows={rows.length ? rows : [[workspaceName, activeUserId, 'Default · joined', '']]} /><Button className="mt-4" onClick={() => setModalOpen(true)}>New teamspace</Button></Section>
      {modalOpen && <NewTeamspaceModal onCreate={(name) => { runAsync(createNewTeamspace(name)); setModalOpen(false); }} onClose={() => setModalOpen(false)} />}
    </>
  );
};

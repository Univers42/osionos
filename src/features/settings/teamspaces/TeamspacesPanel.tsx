/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TeamspacesPanel.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import { Users } from 'lucide-react';

import { useUserStore } from '@/features/auth';
import { usePageStore } from '@/store/usePageStore';
import { useTeamspacesStore } from '@/store/settings';
import { Button, Dropdown, Modal } from '@/shared/ui';
import { ConfirmModal } from '../ui/ConfirmModals';
import { DataTable, EmptyState, Section } from '../ui/settingsKit';
import { runAsync } from '../model/settingsCalls';

// Stable empty: `?? []` inside a zustand-v5 selector returns a FRESH array each
// getSnapshot when the key is absent (new workspace) → infinite-loop blank panel.
const EMPTY_TEAMSPACES: never[] = [];

export const TeamspacesPanel: React.FC = () => {
  const workspace = useUserStore((state) => state.activeWorkspace());
  const workspaceId = workspace?._id ?? 'local-workspace';
  const activeUserId = useUserStore((state) => state.activeUserId) || 'anonymous';
  const jwt = useUserStore((state) => state.activePageJwt());
  const addPage = usePageStore((state) => state.addPage);
  const teamspaces = useTeamspacesStore((state) => state.data[workspaceId] ?? EMPTY_TEAMSPACES);
  const createTeamspace = useTeamspacesStore((state) => state.create);
  const updateTeamspace = useTeamspacesStore((state) => state.update);
  const archiveTeamspace = useTeamspacesStore((state) => state.archive);
  const [modalOpen, setModalOpen] = useState(false);
  const [archiving, setArchiving] = useState<{ id: string; name: string } | null>(null);
  const activeTeamspaces = teamspaces.filter((teamspace) => !teamspace.archivedAt);
  const rows = activeTeamspaces.map((teamspace) => [
    <input key={`${teamspace._id}-name`} aria-label="Teamspace name" className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1 text-sm outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" defaultValue={teamspace.name} onBlur={(event) => updateTeamspace(workspaceId, teamspace._id, { name: event.target.value })} />,
    teamspace.owners.join(', ') || activeUserId,
    <Dropdown key={`${teamspace._id}-access`} label={`${teamspace.name} access`} value={teamspace.access} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'private', label: 'Private' }]} onChange={(value) => updateTeamspace(workspaceId, teamspace._id, { access: value as 'open' | 'closed' | 'private' })} align="end" width="auto" />,
    <Button key={`${teamspace._id}-archive`} tone="danger-subtle" onClick={() => setArchiving({ id: teamspace._id, name: teamspace.name })}>Archive</Button>,
  ]);

  async function createNewTeamspace(name: string) {
    const page = await addPage(workspaceId, name, jwt ?? '', undefined, { icon: '🏛️', visibility: 'shared' });
    createTeamspace(workspaceId, { name, ownerId: activeUserId, pageId: page?._id ?? null });
  }

  return (
    <>
      <Section title="Teamspaces"><p className="mb-3 text-sm text-[var(--osio-fg-muted)]">Manage all teamspaces you have access to here.</p><DataTable headers={['Teamspace', 'Owners', 'Access', '']} rows={rows} empty={<EmptyState icon={<Users size={16} />} title="No teamspaces yet" hint="Create one to group pages for a team." />} /><Button className="mt-4" onClick={() => setModalOpen(true)}>New teamspace</Button></Section>
      {archiving && <ConfirmModal title="Archive teamspace" message={`Archive ${archiving.name}? It leaves this list; its pages are not deleted.`} actionLabel="Archive" danger onConfirm={() => archiveTeamspace(workspaceId, archiving.id)} onClose={() => setArchiving(null)} />}
      {modalOpen && <NewTeamspaceModal onCreate={(name) => { runAsync(createNewTeamspace(name)); setModalOpen(false); }} onClose={() => setModalOpen(false)} />}
    </>
  );
};

const NewTeamspaceModal: React.FC<{ onCreate: (name: string) => void; onClose: () => void }> = ({ onCreate, onClose }) => {
  const [name, setName] = useState('New teamspace');
  return (
    <Modal open onClose={onClose} title="New teamspace" size="sm">
      <div className="space-y-4">
        <label htmlFor="new-teamspace-name" className="block text-sm font-medium text-[var(--osio-fg-default)]">Teamspace name</label>
        <input id="new-teamspace-name" className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={name} onChange={(event) => setName(event.target.value)} />
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone="primary" onClick={() => onCreate(name.trim() || 'New teamspace')}>Create</Button></div>
      </div>
    </Modal>
  );
};

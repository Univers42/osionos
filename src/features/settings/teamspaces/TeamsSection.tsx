/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TeamsSection.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';

import { useUserStore } from '@/features/auth';
import { useTeamspacesStore, useWorkspaceMembersStore } from '@/store/settings';
import type { WorkspaceTeam } from '@/store/settings';
import { Button } from '@/shared/ui';
import { ConfirmModal } from '../ui/ConfirmModals';
import { DataTable, EmptyState, Section } from '../ui/settingsKit';
import { runAsync } from '../model/settingsCalls';

// Stable empties: a fresh `?? []` inside a zustand-v5 selector loops the render.
const NO_TEAMS: WorkspaceTeam[] = [];
const NO_MEMBERS: never[] = [];

/** A person's name from the personas the People panel resolves names with, else the id. */
function labelFor(userId: string, names: Map<string, string>, wireName?: string): string {
  const named = wireName && wireName !== userId ? wireName : names.get(userId);
  return named || userId;
}

const FIELD = 'rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]';

const TeamMembers: React.FC<{ workspaceId: string; team: WorkspaceTeam }> = ({ workspaceId, team }) => {
  const members = useTeamspacesStore((state) => state.teamMembers[team.id] ?? NO_MEMBERS);
  const workspaceMembers = useWorkspaceMembersStore((state) => state.data[workspaceId] ?? NO_MEMBERS);
  const hydrateMembers = useTeamspacesStore((state) => state.hydrateTeamMembers);
  const addMember = useTeamspacesStore((state) => state.addTeamMember);
  const removeMember = useTeamspacesStore((state) => state.removeTeamMember);
  const personas = useUserStore((state) => state.personas);
  const names = useMemo(() => new Map(personas.filter((persona) => persona.id && persona.name).map((persona) => [persona.id, persona.name])), [personas]);
  const [pick, setPick] = useState('');
  useEffect(() => { runAsync(hydrateMembers(workspaceId, team.id)); }, [hydrateMembers, workspaceId, team.id]);
  const taken = new Set(members.map((member) => member.userId));
  const candidates = workspaceMembers.filter((member) => !member.removedAt && !taken.has(member.userId));
  return (
    <div className="mt-2 space-y-2" aria-label={`${team.name} members`}>
      <ul className="space-y-1">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between gap-2 text-sm">
            <span>{labelFor(member.userId, names, member.name)} <span className="text-[var(--osio-fg-muted)]">({member.role})</span></span>
            <Button tone="danger-subtle" onClick={() => runAsync(removeMember(workspaceId, team.id, member.userId))}>Remove</Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <select aria-label={`Add a member to ${team.name}`} className={FIELD} value={pick} onChange={(event) => setPick(event.target.value)}>
          <option value="">Choose a workspace member</option>
          {candidates.map((member) => <option key={member.userId} value={member.userId}>{labelFor(member.userId, names)}</option>)}
        </select>
        <Button disabled={!pick} onClick={() => { runAsync(addMember(workspaceId, team.id, { userId: pick, name: labelFor(pick, names) })); setPick(''); }}>Add member</Button>
      </div>
    </div>
  );
};

export const TeamsSection: React.FC = () => {
  const workspaceId = useUserStore((state) => state.activeWorkspace())?._id ?? 'local-workspace';
  const teams = useTeamspacesStore((state) => state.teams[workspaceId] ?? NO_TEAMS);
  const hydrateTeams = useTeamspacesStore((state) => state.hydrateTeams);
  const createTeam = useTeamspacesStore((state) => state.createTeam);
  const updateTeam = useTeamspacesStore((state) => state.updateTeam);
  const deleteTeam = useTeamspacesStore((state) => state.deleteTeam);
  const [name, setName] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<WorkspaceTeam | null>(null);
  useEffect(() => { runAsync(hydrateTeams(workspaceId)); }, [hydrateTeams, workspaceId]);

  const rows = teams.map((team) => [
    <input key={`${team.id}-name`} aria-label="Team name" className={`w-full ${FIELD}`} defaultValue={team.name} onBlur={(event) => { const next = event.target.value.trim(); if (next && next !== team.name) runAsync(updateTeam(workspaceId, team.id, { name: next })); }} />,
    String(team.memberCount),
    <div key={`${team.id}-members`}>
      <Button onClick={() => setOpen(open === team.id ? null : team.id)}>{open === team.id ? 'Hide members' : 'Members'}</Button>
      {open === team.id && <TeamMembers workspaceId={workspaceId} team={team} />}
    </div>,
    <Button key={`${team.id}-delete`} tone="danger-subtle" onClick={() => setDeleting(team)}>Delete</Button>,
  ]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    runAsync(createTeam(workspaceId, { name: trimmed }));
    setName('');
  }

  return (
    <>
      <Section title="Teams" anchor="teams">
        <p className="mb-3 text-sm text-[var(--osio-fg-muted)]">Group workspace members into teams.</p>
        <DataTable headers={['Team', 'Members', 'Roster', 'Actions']} rows={rows} empty={<EmptyState icon={<Users size={16} />} title="No teams yet" hint="Create a team to group the people who work together." />} />
        <form className="mt-4 flex gap-2" onSubmit={submit}>
          <input aria-label="New team name" placeholder="Team name" className={`flex-1 ${FIELD}`} value={name} onChange={(event) => setName(event.target.value)} />
          <Button type="submit" tone="primary" disabled={!name.trim()}>Create team</Button>
        </form>
      </Section>
      {deleting && <ConfirmModal title="Delete team" message={`Delete ${deleting.name}? Its members stay in the workspace.`} actionLabel="Delete" danger onConfirm={() => runAsync(deleteTeam(workspaceId, deleting.id))} onClose={() => setDeleting(null)} />}
    </>
  );
};

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CollabBrowseView.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Browse joinable projects: filter by visibility, search, join, owner inbox. */

import React from 'react';

import { Input, SectionHeader } from '@/shared/ui';
import { MiniTabs, type MiniTabItem } from '@/shared/ui/primitives';
import { useCollabBrowse, type CollabFilter } from '../model/useCollabBrowse';
import { CollabCard } from './CollabCard';
import { JoinRequestsInbox } from './JoinRequestsInbox';

const FILTERS: MiniTabItem<CollabFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'public', label: 'Public' },
  { value: 'request_to_join', label: 'Request to join' },
];

interface CollabBrowseViewProps {
  /** When set, also show the owner-side join-request inbox for this workspace. */
  ownedWorkspaceId?: string;
}

export const CollabBrowseView: React.FC<CollabBrowseViewProps> = ({ ownedWorkspaceId }) => {
  const browse = useCollabBrowse();
  // Confidential projects are never listed (hidden CTA per spec).
  const visible = browse.filtered.filter((workspace) => workspace.visibility !== 'confidential');

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 overflow-auto p-6">
      <SectionHeader title="Discover projects" />
      <div className="flex flex-wrap items-center gap-3">
        <MiniTabs value={browse.filter} options={FILTERS} onChange={browse.setFilter} />
        <div className="min-w-48 flex-1">
          <Input
            value={browse.query}
            onChange={(event) => browse.setQuery(event.target.value)}
            placeholder="Search projects…"
          />
        </div>
      </div>

      {ownedWorkspaceId ? <JoinRequestsInbox workspaceId={ownedWorkspaceId} /> : null}

      {browse.error ? (
        <p className="text-sm text-[var(--osio-danger)]">{browse.error}</p>
      ) : null}

      {!browse.loading && visible.length === 0 ? (
        <p className="text-sm text-[var(--osio-fg-muted)]">No projects to show.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
          {visible.map((workspace) => (
            <CollabCard key={workspace.id} workspace={workspace} onJoin={browse.join} />
          ))}
        </div>
      )}
    </div>
  );
};

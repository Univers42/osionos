/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CommunityList.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * My-communities list (WhatsApp "Communities" tab): rows from listCommunities,
 * each opening its CommunityPanel. Selection is local component state (no
 * router); the chosen community's channels render in the panel on the right.
 * A "New community" button opens the CreateCommunityModal and refreshes on add.
 */

import React, { useState } from 'react';
import { Plus } from 'lucide-react';

import type { Community } from '@/shared/social/communityApi';
import { Button, IconValueView } from '@/shared/ui';
import { CommunityPanel } from './CommunityPanel';
import { CreateCommunityModal } from './CreateCommunityModal';
import { useCommunities } from './useCommunity';

const CommunityRow: React.FC<{
  community: Community;
  active: boolean;
  onClick: () => void;
}> = ({ community, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-[var(--osio-bg-hover)] ${
      active ? 'bg-[var(--osio-bg-muted)]' : ''
    }`}
  >
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)]">
      {community.avatar ? <IconValueView value={community.avatar} size={16} /> : '🏘️'}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium text-[var(--osio-fg-default)]">
        {community.name}
      </span>
      {community.description ? (
        <span className="block truncate text-xs text-[var(--osio-fg-muted)]">
          {community.description}
        </span>
      ) : null}
    </span>
  </button>
);

export const CommunityList: React.FC = () => {
  const { communities, busy, error, reload } = useCommunities();
  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const activeId = selected ?? communities[0]?.id ?? null;

  return (
    <div className="flex h-full bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]">
      <aside className="flex w-72 shrink-0 flex-col border-r border-[var(--osio-border-default)]">
        <header className="flex min-h-14 items-center justify-between gap-2 border-b border-[var(--osio-border-default)] px-4">
          <h1 className="text-base font-semibold">Communities</h1>
          <Button tone="ghost" aria-label="New community" onClick={() => setCreateOpen(true)}>
            <Plus size={18} />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto p-2">
          {busy && communities.length === 0 ? (
            <p className="px-2 py-2 text-sm text-[var(--osio-fg-muted)]">Loading…</p>
          ) : communities.length === 0 ? (
            <p className="px-2 py-2 text-sm text-[var(--osio-fg-muted)]">
              No communities yet. Create one to group your channels.
            </p>
          ) : (
            <div className="grid gap-0.5">
              {communities.map((community) => (
                <CommunityRow
                  key={community.id}
                  community={community}
                  active={community.id === activeId}
                  onClick={() => setSelected(community.id)}
                />
              ))}
            </div>
          )}
          {error ? <p className="px-2 pt-2 text-sm text-[var(--osio-danger)]">{error}</p> : null}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {activeId ? (
          <CommunityPanel key={activeId} communityId={activeId} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--osio-fg-muted)]">
            Select or create a community.
          </div>
        )}
      </div>

      <CreateCommunityModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(community) => {
          setSelected(community.id);
          void reload();
        }}
      />
    </div>
  );
};

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PeopleSearchBar.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Topbar people search (mounted from SidebarTopNav's search button): type a
 * name, open the member's profile tab, or jump straight into a DM.
 */

import React, { useRef, useState } from 'react';
import { MessageCircle, MoreHorizontal, Search, X } from 'lucide-react';

import { ContactContextMenu } from '@/features/connections/ContactContextMenu';
import { openDm } from '@/shared/chat/channelApi';
import { usePeopleSearch, type PersonHit } from '@/shared/people/usePeopleSearch';
import { usePresenceHeartbeat } from '@/shared/people/usePresenceHeartbeat';
import { profileTab } from '@/widgets/workspace-grid/model/layoutPersist';
import { genId } from '@/widgets/workspace-grid/model/layoutTree';
import { useWorkspaceLayout } from '@/widgets/workspace-grid/model/workspaceLayout';

interface PeopleSearchBarProps {
  onClose: () => void;
}

function openProfile(person: PersonHit, onClose: () => void) {
  useWorkspaceLayout.getState().openTab(profileTab(person.id, person.name));
  onClose();
}

function startDm(person: PersonHit, onClose: () => void) {
  openDm(person.id)
    .then((channel) => {
      useWorkspaceLayout.getState().openTab({
        tabId: genId('tab'),
        pageId: channel.id,
        workspaceId: channel.workspaceId,
        kind: 'channel',
        title: channel.name,
        icon: 'icon:message-circle',
      });
      onClose();
    })
    .catch(() => undefined);
}

const PersonRow: React.FC<{ person: PersonHit; onClose: () => void }> = ({ person, onClose }) => {
  const moreRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <li className="flex items-center gap-2 px-2 py-1">
      <button
        type="button"
        onClick={() => openProfile(person, onClose)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-[var(--osio-bg-hover)]"
      >
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--osio-accent)] text-xs font-semibold text-[var(--osio-accent-fg)]">
          {person.avatar ? <img src={person.avatar} alt="" className="h-full w-full object-cover" /> : person.name.slice(0, 1).toUpperCase()}
        </span>
        <span
          title={person.online ? 'Online' : 'Offline'}
          className={`h-2 w-2 shrink-0 rounded-full ${person.online ? 'bg-green-500' : 'bg-[var(--osio-fg-subtle)]'}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{person.name}</span>
          {person.wsRole && <span className="block truncate text-xs text-[var(--osio-fg-muted)]">{person.wsRole}</span>}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Message ${person.name}`}
        title={`Message ${person.name}`}
        onClick={() => startDm(person, onClose)}
        className="rounded p-1.5 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
      >
        <MessageCircle size={14} />
      </button>
      <button
        ref={moreRef}
        type="button"
        aria-label={`More actions for ${person.name}`}
        onClick={() => setMenuOpen((value) => !value)}
        className="rounded p-1.5 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
      >
        <MoreHorizontal size={14} />
      </button>
      <ContactContextMenu
        userId={person.id}
        name={person.name}
        anchorRef={moreRef}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
    </li>
  );
};

export const PeopleSearchBar: React.FC<PeopleSearchBarProps> = ({ onClose }) => {
  const [query, setQuery] = useState('');
  const { people, loading } = usePeopleSearch(query);
  usePresenceHeartbeat();

  return (
    <div className="absolute left-0 right-0 top-9 z-30 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-lg">
      <div className="flex items-center gap-2 border-b border-[var(--osio-border-default)] px-3 py-2">
        <Search size={14} className="shrink-0 text-[var(--osio-fg-muted)]" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}
          placeholder="Search people…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--osio-fg-subtle)]"
        />
        <button type="button" aria-label="Close people search" onClick={onClose} className="rounded p-0.5 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]">
          <X size={14} />
        </button>
      </div>
      <ul className="max-h-72 overflow-y-auto py-1">
        {people.map((person) => (
          <PersonRow key={person.id} person={person} onClose={onClose} />
        ))}
        {!loading && people.length === 0 && (
          <li className="px-3 py-3 text-sm text-[var(--osio-fg-muted)]">No people found.</li>
        )}
      </ul>
    </div>
  );
};

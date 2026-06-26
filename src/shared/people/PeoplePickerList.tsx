/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PeoplePickerList.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Reusable debounced people picker (search input + selectable rows). Lifted
 * from widgets/dm-list so DM start, group creation, and member-add all share
 * one list. Single-select (`onPick` per click) and multi-select (toggle +
 * `selected` set) are both supported.
 */

import React, { useState } from 'react';

import { usePeopleSearch, type PersonHit } from '@/shared/people/usePeopleSearch';

interface PeoplePickerListProps {
  multiSelect?: boolean;
  onPick: (person: PersonHit) => void;
  selected?: ReadonlySet<string> | string[];
  placeholder?: string;
  autoFocus?: boolean;
  onEscape?: () => void;
  /** Shown FIRST when the search box is empty (e.g. your connections) instead of the
   *  full directory; typing still searches everyone. */
  connections?: PersonHit[];
}

function isSelected(selected: PeoplePickerListProps['selected'], id: string): boolean {
  if (!selected) return false;
  return Array.isArray(selected) ? selected.includes(id) : selected.has(id);
}

export const PeoplePickerList: React.FC<PeoplePickerListProps> = ({
  multiSelect = false,
  onPick,
  selected,
  placeholder = 'Search people…',
  autoFocus = true,
  onEscape,
  connections,
}) => {
  const [query, setQuery] = useState('');
  const { people } = usePeopleSearch(query);
  // Empty box → your connections first (if any); typing searches the whole directory.
  const showConnections = query.trim() === '' && !!connections && connections.length > 0;
  const rows = showConnections ? connections : people;

  return (
    <div className="rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-1.5">
      <input
        autoFocus={autoFocus}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Escape') onEscape?.(); }}
        placeholder={placeholder}
        className="w-full rounded border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1 text-sm outline-none focus:border-[var(--osio-accent)]"
      />
      {showConnections ? (
        <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--osio-fg-subtle)]">Your connections</p>
      ) : null}
      <ul className="mt-1 max-h-44 overflow-y-auto">
        {rows.map((person) => {
          const picked = isSelected(selected, person.id);
          return (
            <li key={person.id}>
              <button
                type="button"
                aria-pressed={multiSelect ? picked : undefined}
                onClick={() => onPick(person)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-[var(--osio-bg-hover)] ${picked ? 'bg-[var(--osio-bg-hover)]' : ''}`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${person.online ? 'bg-green-500' : 'bg-[var(--osio-fg-subtle)]'}`} />
                <span className="truncate">{person.name}</span>
                {multiSelect && picked ? <span className="ml-auto text-xs text-[var(--osio-accent)]">✓</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

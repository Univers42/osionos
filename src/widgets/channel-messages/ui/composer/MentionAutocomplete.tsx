/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MentionAutocomplete.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * "@" mention picker for the composer: reuses the shared people directory
 * search and inserts @username on click. Anchored above the input. mouseDown +
 * preventDefault keeps the textarea focused so the pick lands cleanly.
 */

import React from 'react';

import { usePeopleSearch } from '@/shared/people/usePeopleSearch';

interface MentionAutocompleteProps {
  query: string;
  onPick: (username: string) => void;
}

/** Detect a trailing "@handle" being typed at the caret → its partial, else null. */
export function mentionQuery(text: string, caret: number): string | null {
  const match = /(?:^|\s)@([a-z0-9_.]*)$/i.exec(text.slice(0, caret));
  return match ? match[1] : null;
}

export const MentionAutocomplete: React.FC<MentionAutocompleteProps> = ({ query, onPick }) => {
  const { people } = usePeopleSearch(query);
  const candidates = people.filter((p) => p.username).slice(0, 6);
  if (candidates.length === 0) return null;
  return (
    <div className="absolute bottom-full left-0 z-[var(--osio-z-modal)] mb-2 w-72 overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-[var(--osio-shadow-menu)]">
      {candidates.map((person) => (
        <button
          key={person.id}
          type="button"
          onMouseDown={(event) => { event.preventDefault(); onPick(person.username as string); }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--osio-bg-hover)]"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--osio-accent)] text-[10px] font-semibold text-[var(--osio-accent-fg)]">
            {person.avatar ? <img src={person.avatar} alt="" className="h-full w-full object-cover" /> : person.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-[var(--osio-fg-default)]">{person.name}</span>
            <span className="block truncate text-xs text-[var(--osio-fg-muted)]">@{person.username}</span>
          </span>
        </button>
      ))}
    </div>
  );
};

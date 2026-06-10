/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SharePeoplePicker.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { SharePerson } from './types';

interface SharePeoplePickerProps {
  people: SharePerson[];
  /** Keys already in the dialog (user:<id>) so picked people are filtered out. */
  excludedKeys: string[];
  disabled?: boolean;
  onPick: (person: SharePerson) => void;
}

/** Search-and-pick over the workspace roster (mirrors the People panel UX). */
export const SharePeoplePicker: React.FC<SharePeoplePickerProps> = ({ people, excludedKeys, disabled = false, onPick }) => {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const excluded = new Set(excludedKeys);
    return people
      .filter((person) => !excluded.has(`user:${person.id}`))
      .filter((person) => !needle
        || `${person.name} ${person.email} ${person.role} ${person.department ?? ''}`.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [excludedKeys, people, query]);

  return (
    <div className="space-y-1">
      <label className="flex h-8 items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 text-sm text-[var(--osio-fg-muted)] focus-within:border-[var(--osio-accent)]">
        <Search size={14} />
        <input
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Add people by name, email or role…"
          className="min-w-0 flex-1 bg-transparent text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
        />
      </label>
      {query.trim() && (
        <div className="overflow-hidden rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-lg">
          {matches.length === 0 && <p className="px-3 py-2 text-xs text-[var(--osio-fg-muted)]">No people match.</p>}
          {matches.map((person) => (
            <button
              key={person.id}
              type="button"
              disabled={disabled}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--osio-bg-hover)]"
              onClick={() => { onPick(person); setQuery(''); }}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-[var(--osio-fg-default)]">{person.name}</span>
                <span className="block truncate text-xs text-[var(--osio-fg-muted)]">{person.email}</span>
              </span>
              <span className="shrink-0 rounded bg-[var(--osio-bg-subtle)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--osio-fg-muted)]">
                {person.role}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

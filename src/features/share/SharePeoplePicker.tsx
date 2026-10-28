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
import { Button, Input } from '@/shared/ui';
import { validateName, validateValue } from './memberAttribute';
import type { SharePerson, ShareTeam } from './types';

interface SharePeoplePickerProps {
  people: SharePerson[];
  /** Offered above the people; empty hides the group. */
  teams?: ShareTeam[];
  /** Keys already in the dialog (user:<id>) so picked people are filtered out. */
  excludedKeys: string[];
  disabled?: boolean;
  onPick: (person: SharePerson) => void;
  onPickTeam?: (team: ShareTeam) => void;
  onPickAttribute?: (name: string, value: string) => void;
  onPickAttr?: (name: string, value: string) => void;
  onAddAttribute?: (name: string, value: string) => void;
}

/** Search-and-pick over the workspace roster (mirrors the People panel UX). */
export const SharePeoplePicker: React.FC<SharePeoplePickerProps> = ({ people, teams = [], excludedKeys, disabled = false, onPick, onPickTeam, onPickAttribute, onPickAttr, onAddAttribute }) => {
  const [query, setQuery] = useState('');
  const [attrName, setAttrName] = useState('');
  const [attrValue, setAttrValue] = useState('');
  const [attrError, setAttrError] = useState<string | null>(null);

  const pickAttribute = (name: string, value: string) => {
    const nameError = validateName(name);
    const valueError = validateValue(value);
    if (nameError || valueError) {
      setAttrError(nameError ?? valueError);
      return;
    }
    setAttrError(null);
    const handler = onPickAttribute ?? onPickAttr ?? onAddAttribute;
    handler?.(name.trim(), value.trim());
    setAttrName('');
    setAttrValue('');
  };

  const onAttrKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      pickAttribute(attrName, attrValue);
    }
  };
  const needle = query.trim().toLowerCase();
  const teamMatches = useMemo(() => {
    const excluded = new Set(excludedKeys);
    return teams
      .filter((team) => !excluded.has(`team:${team.id}`))
      .filter((team) => !needle || team.name.toLowerCase().includes(needle))
      .slice(0, 4);
  }, [excludedKeys, needle, teams]);
  const matches = useMemo(() => {
    const excluded = new Set(excludedKeys);
    return people
      .filter((person) => !excluded.has(`user:${person.id}`))
      .filter((person) => !needle
        || `${person.name} ${person.email} ${person.role} ${person.department ?? ''}`.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [excludedKeys, needle, people]);

  return (
    <div className="space-y-1">
      <label className="flex h-8 items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 text-sm text-[var(--osio-fg-muted)] focus-within:border-[var(--osio-accent)]">
        <Search size={14} />
        <input
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={teams.length ? 'Add teams or people by name, email or role…' : 'Add people by name, email or role…'}
          className="min-w-0 flex-1 bg-transparent text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
        />
      </label>
      {query.trim() && (
        <div className="overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] shadow-[var(--osio-shadow-menu)]">
          {teamMatches.length > 0 && <p className="osio-menu-label">Teams</p>}
          {teamMatches.map((team) => (
            <button
              key={team.id}
              type="button"
              disabled={disabled}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors duration-(--osio-dur-fast) hover:bg-[var(--osio-bg-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => { onPickTeam?.(team); setQuery(''); }}
            >
              <span className="block min-w-0 truncate font-medium text-[var(--osio-fg-default)]">{team.name}</span>
              <span className="shrink-0 text-xs text-[var(--osio-fg-muted)]">{team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}</span>
            </button>
          ))}
          {teamMatches.length > 0 && matches.length > 0 && <p className="osio-menu-label">People</p>}
          {matches.length === 0 && teamMatches.length === 0 && <p className="px-3 py-2 text-xs text-[var(--osio-fg-muted)]">No teams or people match.</p>}
          {matches.map((person) => (
            <button
              key={person.id}
              type="button"
              disabled={disabled}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors duration-(--osio-dur-fast) hover:bg-[var(--osio-bg-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => { onPick(person); setQuery(''); }}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-[var(--osio-fg-default)]">{person.name}</span>
                <span className="block truncate text-xs text-[var(--osio-fg-muted)]">{person.email}</span>
              </span>
              <span className="shrink-0 rounded-full bg-[var(--osio-bg-subtle)] px-1.5 py-0.5 text-3xs uppercase tracking-wide text-[var(--osio-fg-muted)]">
                {person.role}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 space-y-1" data-attribute-target>
        <p className="osio-menu-label">Attribute</p>
        <div className="flex items-center gap-2">
          <Input
            value={attrName}
            disabled={disabled}
            onChange={(event) => setAttrName(event.target.value)}
            onKeyDown={onAttrKeyDown}
            placeholder="name"
            aria-label="Attribute name"
            className="min-w-0 flex-1"
          />
          <Input
            value={attrValue}
            disabled={disabled}
            onChange={(event) => setAttrValue(event.target.value)}
            onKeyDown={onAttrKeyDown}
            placeholder="value"
            aria-label="Attribute value"
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            disabled={disabled}
            onClick={() => pickAttribute(attrName, attrValue)}
          >
            Add
          </Button>
        </div>
        {attrError && <p role="alert" className="text-xs text-[var(--osio-danger)]">{attrError}</p>}
      </div>
    </div>
  );
};

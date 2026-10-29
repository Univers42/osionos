/* ************************************************************************** */
/*                                                                            */
/*   LibraryToolbar.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur         #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// The icon row at the right of the Library tabs, as in Notion: Filter
// (created by), Search (opens an inline field) and Sort (a sliders menu).
// Each control is quiet until used; an active filter or sort stays tinted.

import React, { useRef, useState } from "react";
import { Check, ListFilter, Search, SlidersHorizontal, X } from "lucide-react";
import { IconButton, Menu, MenuItem, Popover } from "@osionos/ui";
import { LIBRARY_CREATORS, LIBRARY_SORTS, type LibraryCreator, type LibrarySort } from "../model/pageLibraryModel";

const SORT_LABELS: Record<LibrarySort, string> = {
  visited: "Last visited",
  edited: "Last edited",
  title: "Title",
};

const CREATOR_LABELS: Record<LibraryCreator, string> = {
  anyone: "Anyone",
  me: "Me",
};

const ACTIVE_TONE = "text-[var(--osio-accent)] hover:text-[var(--osio-accent)]";

interface ChoiceMenuProps<T extends string> {
  label: string;
  icon: React.ReactNode;
  heading: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  active: boolean;
  onChange: (next: T) => void;
}

function ChoiceMenu<T extends string>({ label, icon, heading, options, labels, value, active, onChange }: Readonly<ChoiceMenuProps<T>>) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        ref={anchorRef}
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={active ? ACTIVE_TONE : undefined}
      >
        {icon}
      </IconButton>
      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} align="end">
        <Menu aria-label={heading} className="w-52">
          <p className="px-3 pb-1 pt-1.5 text-xs font-medium text-[var(--osio-fg-subtle)]">{heading}</p>
          {options.map((option) => (
            <MenuItem
              key={option}
              role="menuitemradio"
              aria-checked={option === value}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              <span className="flex items-center justify-between gap-2">
                {labels[option]}
                {option === value ? <Check size={14} aria-hidden="true" /> : null}
              </span>
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </>
  );
}

interface LibraryToolbarProps {
  query: string;
  onQueryChange: (next: string) => void;
  sort: LibrarySort;
  onSortChange: (next: LibrarySort) => void;
  creator: LibraryCreator;
  onCreatorChange: (next: LibraryCreator) => void;
}

export const LibraryToolbar: React.FC<LibraryToolbarProps> = ({ query, onQueryChange, sort, onSortChange, creator, onCreatorChange }) => {
  const [searching, setSearching] = useState(query.length > 0);

  const closeSearch = () => {
    onQueryChange("");
    setSearching(false);
  };

  return (
    <div className="ml-auto flex items-center gap-0.5">
      <ChoiceMenu
        label="Filter"
        icon={<ListFilter size={16} aria-hidden="true" />}
        heading="Created by"
        options={LIBRARY_CREATORS}
        labels={CREATOR_LABELS}
        value={creator}
        active={creator !== "anyone"}
        onChange={onCreatorChange}
      />
      {searching ? (
        <label className="flex h-7 w-48 items-center gap-1.5 rounded-md bg-[var(--osio-bg-subtle)] px-2 text-[var(--osio-fg-muted)]">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search pages"
            placeholder="Type to search…"
            autoFocus
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeSearch();
            }}
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)] [&::-webkit-search-cancel-button]:hidden"
          />
          <button type="button" aria-label="Close search" onClick={closeSearch} className="rounded-sm text-[var(--osio-fg-subtle)] hover:text-[var(--osio-fg-default)]">
            <X size={14} aria-hidden="true" />
          </button>
        </label>
      ) : (
        <IconButton label="Search" onClick={() => setSearching(true)}>
          <Search size={16} aria-hidden="true" />
        </IconButton>
      )}
      <ChoiceMenu
        label="Sort"
        icon={<SlidersHorizontal size={16} aria-hidden="true" />}
        heading="Sort by"
        options={LIBRARY_SORTS}
        labels={SORT_LABELS}
        value={sort}
        active={sort !== "visited"}
        onChange={onSortChange}
      />
    </div>
  );
};

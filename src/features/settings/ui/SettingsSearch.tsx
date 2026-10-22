/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SettingsSearch.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Settings search, answering from the one registry. Enter opens the first hit —
// navigating plus targeting the anchor in one call; Escape clears the query.

import React, { useState } from "react";
import { Search } from "lucide-react";

import { searchSettings, type SettingsSearchHit } from "@/features/settings/model/sections";
import { openSettings } from "@/features/settings/model/settingsNav";

// Same cap as the modal handed to screen list rendering. Caveat: deeper matching
// hits beyond the eighth are silently dropped — longer queries win nothing.
const MAX_RESULTS = 8;

export const SettingsSearch: React.FC = () => {
  const [query, setQuery] = useState("");
  const results = query.trim() ? searchSettings(query).slice(0, MAX_RESULTS) : [];

  function openResult(hit: SettingsSearchHit) {
    setQuery("");
    openSettings(hit.section.id, hit.anchor.id);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && results[0]) {
      event.preventDefault();
      openResult(results[0]);
    }
    if (event.key === "Escape") setQuery("");
  }

  return (
    <div role="search" className="relative max-w-lg pt-2">
      <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 text-sm text-[var(--osio-fg-muted)] focus-within:border-[var(--osio-accent)]">
        <Search size={16} />
        <input
          type="search"
          aria-label="Search settings"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search actions..."
          className="min-w-0 flex-1 bg-transparent text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
        />
      </label>
      {results.length > 0 ? (
        <div className="absolute left-0 right-0 top-full z-[var(--osio-z-popover)] mt-2 overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] py-1 shadow-[var(--osio-shadow-menu)]">
          {results.map((hit) => (
            <button
              key={`${hit.section.id}-${hit.anchor.id}`}
              type="button"
              className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-[var(--osio-bg-hover)]"
              onClick={() => openResult(hit)}
            >
              <span className="font-medium text-[var(--osio-fg-default)]">{hit.anchor.label}</span>
              <span className="text-xs capitalize text-[var(--osio-fg-muted)]">{hit.section.id.replaceAll("_", " ")}</span>
            </button>
          ))}
        </div>
      ) : query.trim() ? (
        // No hit is an answer too: the search says so instead of dropping the
        // list silently.
        <div className="absolute left-0 right-0 top-full z-[var(--osio-z-popover)] mt-2 overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] py-1 shadow-[var(--osio-shadow-menu)]">
          <p role="status" className="px-3 py-2 text-sm text-[var(--osio-fg-muted)]">No settings match “{query.trim()}”</p>
        </div>
      ) : null}
    </div>
  );
};

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SearchResults.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import type { BlockMatch, PageGroup } from "../model/resultModel";

interface Props {
  results: PageGroup[];
  onOpen: (group: PageGroup, match: BlockMatch) => void;
}

const MAX_PER_GROUP = 50;

/** Grouped find results: one header per page, then its matches with context. */
export const SearchResults: React.FC<Props> = ({ results, onOpen }) => {
  if (results.length === 0) return null;
  return (
    <div className="flex-1 overflow-y-auto px-1 pb-4">
      {results.map((group) => (
        <div key={group.pageId} className="mb-1">
          <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-[var(--osio-fg-default)]">
            <span className="min-w-0 flex-1 truncate">{group.title}</span>
            {!group.editable ? (
              <span className="text-[10px] text-[var(--osio-fg-subtle)]">read-only</span>
            ) : null}
            <span className="rounded bg-[var(--osio-bg-muted)] px-1.5 text-[10px] text-[var(--osio-fg-muted)]">
              {group.matchCount}
            </span>
          </div>
          {group.matches.slice(0, MAX_PER_GROUP).map((match, index) => (
            <button
              key={`${group.pageId}:${index}`}
              type="button"
              onClick={() => onOpen(group, match)}
              className="block w-full truncate rounded px-2 py-0.5 pl-5 text-left text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
            >
              <span className="opacity-70">{match.before}</span>
              <mark className="rounded-sm bg-[var(--osio-accent-subtle)] px-0.5 text-[var(--osio-fg-default)]">
                {match.hit}
              </mark>
              <span className="opacity-70">{match.after}</span>
            </button>
          ))}
          {group.matchCount > MAX_PER_GROUP ? (
            <p className="px-5 py-0.5 text-[10px] text-[var(--osio-fg-subtle)]">
              +{group.matchCount - MAX_PER_GROUP} more
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
};

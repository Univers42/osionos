/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DataSourcePicker.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * "Select the data source" panel: every registered live mount (engine badge)
 * with its tables, searchable, one click → `onPick(baas:<dbId>:<table>)`.
 * Pure presentation over listLiveSources(); the caller owns persistence
 * (block attr commit) and dismissal.
 */

import React from "react";
import { listLiveSources, type LiveSourceMount } from "../model/liveMountTables";

interface DataSourcePickerProps {
  current?: string;
  onPick: (databaseId: string) => void;
  onClose: () => void;
}

export const DataSourcePicker: React.FC<DataSourcePickerProps> = ({ current, onPick, onClose }) => {
  const [sources, setSources] = React.useState<LiveSourceMount[] | null>(null);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    let active = true;
    listLiveSources().then((catalog) => {
      if (active) setSources(catalog);
    });
    return () => {
      active = false;
    };
  }, []);

  const needle = query.trim().toLowerCase();
  return (
    <div
      className="w-72 max-h-96 overflow-auto rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-[var(--osio-shadow-menu)] p-2 text-sm"
      role="dialog"
      aria-label="Select data source"
    >
      <div className="flex items-center gap-2 pb-2">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
          placeholder="Search mounts and tables…"
          className="flex-1 rounded border border-[var(--osio-border-default)] bg-transparent px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)] focus:border-[var(--osio-accent)]"
          aria-label="Search data sources"
        />
        <button type="button" onClick={onClose} aria-label="Close" className="px-1 text-[var(--osio-fg-subtle)]">✕</button>
      </div>
      {sources === null && <div className="px-2 py-3 text-[var(--osio-fg-subtle)]">Loading sources…</div>}
      {sources?.length === 0 && (
        <div className="px-2 py-3 text-[var(--osio-fg-subtle)]">
          No live mounts configured (VITE_BAAS_LIVE_MOUNTS / registry).
        </div>
      )}
      {sources?.map(({ mount, tables, error }) => {
        const visible = tables.filter((entry) =>
          !needle || entry.table.toLowerCase().includes(needle) || mount.name.toLowerCase().includes(needle));
        if (needle && visible.length === 0) return null;
        return (
          <div key={mount.dbId} className="pb-2">
            <div className="flex items-center gap-2 px-2 py-1 font-semibold">
              <span>{mount.name}</span>
              <span className="rounded bg-[var(--osio-bg-page)] px-1.5 text-[10px] uppercase text-[var(--osio-fg-subtle)]">
                {mount.engine}
              </span>
            </div>
            {error && <div className="px-2 text-xs text-red-500">{error}</div>}
            {visible.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onPick(entry.id)}
                className={[
                  "flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-[var(--osio-bg-page)]",
                  entry.id === current ? "bg-[var(--osio-bg-page)] font-medium" : "",
                ].join(" ")}
              >
                <span className="truncate">{entry.table}</span>
                <span className="text-[10px] text-[var(--osio-fg-subtle)]">{entry.columnCount} cols</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
};

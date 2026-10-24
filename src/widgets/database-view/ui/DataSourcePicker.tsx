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
      className="osio-surface-overlay max-h-96 w-72 overflow-auto text-sm"
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
          className="osio-field flex-1 px-2"
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
              <span className="rounded-full bg-[var(--osio-bg-muted)] px-1.5 text-3xs uppercase text-[var(--osio-fg-subtle)]">
                {mount.engine}
              </span>
            </div>
            {error && <div className="px-2 text-xs text-[var(--osio-danger)]">{error}</div>}
            {visible.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onPick(entry.id)}
                className={[
                  "osio-menu-item justify-between",
                  entry.id === current ? "bg-[var(--osio-menu-item-hover-bg)] font-medium" : "",
                ].join(" ")}
              >
                <span className="truncate">{entry.table}</span>
                <span className="text-3xs text-[var(--osio-fg-subtle)]">{entry.columnCount} cols</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
};

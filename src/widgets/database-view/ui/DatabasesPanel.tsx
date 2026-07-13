/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DatabasesPanel.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Database, Loader2, RefreshCw, Table2 } from "lucide-react";

import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { liveDatabaseTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useDatabaseStore } from "@/store/useDatabaseStore";
import { useLiveDatabaseCatalog } from "../model/useLiveDatabaseCatalog";
import type { LiveSourceMount } from "../model/liveMountTables";

/** Token color for the per-mount status dot: ok / no-tables / error. */
function dotColor(mount: LiveSourceMount): string {
  if (mount.error) return "var(--osio-danger)";
  if (mount.tables.length === 0) return "var(--osio-warning)";
  return "var(--osio-success)";
}

/** One database mount: collapsible header + its tables. Click a table to open it. */
const MountGroup: React.FC<{ source: LiveSourceMount; query: string }> = ({ source, query }) => {
  const [collapsed, setCollapsed] = useState(false);
  const tables = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || source.mount.name.toLowerCase().includes(q)) return source.tables;
    return source.tables.filter((t) => t.table.toLowerCase().includes(q));
  }, [source, query]);

  const open = (id: string, table: string) =>
    useWorkspaceLayout.getState().openTab(liveDatabaseTab(id, table));

  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className="group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-[var(--osio-bg-hover)]"
      >
        {collapsed ? <ChevronRight size={14} className="shrink-0 text-[var(--osio-fg-subtle)]" /> : <ChevronDown size={14} className="shrink-0 text-[var(--osio-fg-subtle)]" />}
        <Database size={14} className="shrink-0 text-[var(--osio-fg-muted)]" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--osio-fg-default)]">{source.mount.name}</span>
        <span className="shrink-0 rounded bg-[var(--osio-bg-hover)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--osio-fg-muted)]">{source.mount.engine}</span>
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor(source) }}
          title={source.error ?? `${source.tables.length} tables`}
        />
      </button>

      {!collapsed && (
        <div className="ml-3 border-l border-[var(--osio-border-default)] pl-1.5">
          {source.error ? (
            <p className="flex items-center gap-1.5 px-1.5 py-1 text-xs text-[var(--osio-danger)]">
              <AlertTriangle size={12} className="shrink-0" /> {source.error}
            </p>
          ) : tables.length === 0 ? (
            <p className="px-1.5 py-1 text-xs text-[var(--osio-fg-subtle)]">
              {source.introspectable === false
                ? `Schema introspection isn't supported for ${source.mount.engine}.`
                : "No tables"}
            </p>
          ) : (
            tables.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => open(t.id, t.table)}
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-[var(--osio-bg-hover)]"
              >
                <Table2 size={13} className="shrink-0 text-[var(--osio-fg-subtle)]" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--osio-fg-default)]">{t.table}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-[var(--osio-fg-subtle)]">{t.columnCount} cols</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

/** "Your databases": every database created from the editor — the origin place.
 *  Click one to open its full-page tab (rename/manage it there). */
const CreatedDatabasesSection: React.FC<{ query: string }> = ({ query }) => {
  const created = useDatabaseStore((s) => s.created);
  const q = query.trim().toLowerCase();
  const visible = q ? created.filter((entry) => entry.name.toLowerCase().includes(q)) : created;
  if (visible.length === 0) return null;

  return (
    <div className="mb-2">
      <p className="px-1.5 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--osio-fg-subtle)]">
        Your databases
      </p>
      {visible.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => useWorkspaceLayout.getState().openTab({ ...liveDatabaseTab(entry.id, entry.name), viewId: entry.viewId })}
          className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-[var(--osio-bg-hover)]"
        >
          <Database size={14} className="shrink-0 text-[var(--osio-fg-muted)]" />
          <span className="min-w-0 flex-1 truncate text-sm text-[var(--osio-fg-default)]">{entry.name}</span>
        </button>
      ))}
    </div>
  );
};

/** Sidebar navigator: every connected live database + its tables. */
export const DatabasesPanel: React.FC = () => {
  const { status, mounts, error, reload } = useLiveDatabaseCatalog();
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mounts;
    return mounts.filter((m) => m.mount.name.toLowerCase().includes(q) || m.tables.some((t) => t.table.toLowerCase().includes(q)));
  }, [mounts, query]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 px-2 pt-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search databases & tables"
          aria-label="Search databases and tables"
          className="min-w-0 flex-1 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1.5 text-sm text-[var(--osio-fg-default)] placeholder:text-[var(--osio-fg-subtle)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--osio-accent)]"
        />
        <button type="button" onClick={reload} aria-label="Reconnect databases" title="Reconnect" className="shrink-0 rounded-md border border-[var(--osio-border-default)] p-1.5 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]">
          <RefreshCw size={16} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-5 pt-1">
        <CreatedDatabasesSection query={query} />
        {status === "loading" ? (
          <p className="flex items-center gap-2 px-2 py-10 text-center text-xs text-[var(--osio-fg-subtle)]">
            <Loader2 size={14} className="animate-spin" /> Connecting to your databases…
          </p>
        ) : status === "unconfigured" ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Database size={24} strokeWidth={1.5} className="text-[var(--osio-fg-subtle)]" />
            <p className="text-xs text-[var(--osio-fg-subtle)]">
              Live databases aren&apos;t configured — the app has no bridge URL. Set{" "}
              <code className="text-[var(--osio-fg-muted)]">VITE_API_URL</code> (the osionos bridge,
              e.g. <code className="text-[var(--osio-fg-muted)]">https://localhost:4000</code>) and rebuild.
            </p>
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <AlertTriangle size={24} strokeWidth={1.5} className="text-[var(--osio-danger)]" />
            <p className="text-xs text-[var(--osio-fg-subtle)]">Couldn&apos;t load your databases.</p>
            {error ? <p className="text-[11px] break-all text-[var(--osio-danger)]">{error}</p> : null}
            <button type="button" onClick={reload} className="text-xs text-[var(--osio-accent-text)] hover:underline">Retry</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Database size={24} strokeWidth={1.5} className="text-[var(--osio-fg-subtle)]" />
            <p className="text-xs text-[var(--osio-fg-subtle)]">{query ? "No matching databases." : "No databases connected."}</p>
            <button type="button" onClick={reload} className="text-xs text-[var(--osio-accent-text)] hover:underline">Retry</button>
          </div>
        ) : (
          visible.map((source) => <MountGroup key={source.mount.dbId} source={source} query={query} />)
        )}
      </nav>
    </div>
  );
};

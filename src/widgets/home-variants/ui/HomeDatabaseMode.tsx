/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   HomeDatabaseMode.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Database, Table2, Layers } from "lucide-react";

import { baasConfigured } from "@/features/second-brain/baas/baasFetch";
import { fetchDatabaseCatalog, tableColumns, type DatabaseMount } from "../model/baasDatabaseData";
import { Centered, PaneHeader, PickButton, RecordsTable } from "./DatabaseBrowserParts";

type LoadState = "loading" | "ready" | "error";

/**
 * Home "Database" variant: browse the real distributed BaaS — pick a database (mount), then a
 * table (resource), then see its records (rows) with a live count. A database contains many
 * tables. Reads via the proven /graph/overview sampler; degrades gracefully with no backend.
 */
export const HomeDatabaseMode: React.FC = () => {
  const [state, setState] = useState<LoadState>("loading");
  const [catalog, setCatalog] = useState<DatabaseMount[]>([]);
  const [error, setError] = useState("");
  const [dbId, setDbId] = useState("");
  const [table, setTable] = useState("");

  const reload = useCallback(async () => {
    setState("loading");
    try {
      setCatalog(await fetchDatabaseCatalog());
      setState("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load databases");
      setState("error");
    }
  }, []);

  useEffect(() => {
    // Microtask: reload() sets "loading" synchronously, and a sync setState
    // inside an effect cascades a render before paint (react-hooks rule).
    if (baasConfigured()) queueMicrotask(() => void reload());
  }, [reload]);

  const activeDb = useMemo(() => catalog.find((mount) => mount.dbId === dbId) ?? catalog[0], [catalog, dbId]);
  const activeTable = useMemo(
    () => activeDb?.tables.find((entry) => entry.table === table) ?? activeDb?.tables[0],
    [activeDb, table],
  );
  const columns = useMemo(() => (activeTable ? tableColumns(activeTable.rows) : []), [activeTable]);

  if (!baasConfigured()) {
    return <Centered title="No backend connected" hint="Set VITE_BAAS_URL to browse your distributed databases here." />;
  }
  if (state === "loading") return <Centered title="Loading databases…" />;
  if (state === "error") return <Centered title="Couldn't load databases" hint={error} onRetry={reload} />;
  if (catalog.length === 0) {
    return <Centered title="No databases yet" hint="Records you create appear here as databases (mounts) → tables → records." onRetry={reload} />;
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-52 shrink-0 overflow-auto border-r border-[var(--osio-border-default)] p-2">
        <PaneHeader icon={<Database size={13} />} label="Databases" onRefresh={reload} />
        {catalog.map((mount) => (
          <PickButton key={mount.dbId} active={mount.dbId === activeDb?.dbId} icon={<Database size={14} />}
            label={mount.dbId} meta={`${mount.tables.length}`} onClick={() => { setDbId(mount.dbId); setTable(""); }} />
        ))}
      </aside>

      <aside className="w-52 shrink-0 overflow-auto border-r border-[var(--osio-border-default)] p-2">
        <PaneHeader icon={<Table2 size={13} />} label="Tables" />
        {(activeDb?.tables ?? []).map((entry) => (
          <PickButton key={entry.table} active={entry.table === activeTable?.table} icon={<Table2 size={14} />}
            label={entry.table} meta={`${entry.rows.length}`} onClick={() => setTable(entry.table)} />
        ))}
      </aside>

      <section className="min-w-0 flex-1 overflow-auto p-3">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--osio-fg-muted)]">
          <Layers size={14} />
          <strong className="text-[var(--osio-fg-default)]">{activeTable?.table ?? "—"}</strong>
          {activeTable ? <span>{activeTable.rows.length} records</span> : null}
        </div>
        {activeTable
          ? <RecordsTable columns={columns} rows={activeTable.rows} />
          : <p className="text-sm text-[var(--osio-fg-subtle)]">Select a table.</p>}
      </section>
    </div>
  );
};

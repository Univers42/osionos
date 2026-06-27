/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   RecordChildRecords.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 07:35:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 07:35:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Layer 3 surface: real child RECORDS of a record, where its source table has a
 * self-referential FK (e.g. an employee's direct reports). Renders nothing when
 * no self-FK exists — the universal note sub-items remain the default. Creating
 * inserts a real row; clicking a child opens it as its own record-note (so it can
 * itself carry sub-items, recursively).
 */

import React from "react";
import { Boxes, Plus } from "lucide-react";
import { openNotePage, openRecordNote, type LiveRecordRef } from "../model/recordSubItems";
import {
  type SelfRefInfo,
  childRecordLabel,
  createChildRecord,
  fetchSelfRefInfo,
  listChildRecords,
} from "../model/liveChildRecords";

export const RecordChildRecords: React.FC<{ recordRef: LiveRecordRef; compact?: boolean }> = ({ recordRef, compact }) => {
  const [info, setInfo] = React.useState<SelfRefInfo | null>(null);
  const [rows, setRows] = React.useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = React.useState(false);
  const refKey = `${recordRef.dbId}:${recordRef.table}:${recordRef.pk}`;

  React.useEffect(() => {
    let alive = true;
    fetchSelfRefInfo(recordRef).then((found) => {
      if (!alive || !found) { if (alive) setInfo(null); return; }
      setInfo(found);
      listChildRecords(recordRef, found).then((r) => { if (alive) setRows(r); });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refKey]);

  if (!info) return null;

  async function handleCreate() {
    if (!info || busy) return;
    setBusy(true);
    const ok = await createChildRecord(recordRef, info);
    if (ok) setRows(await listChildRecords(recordRef, info));
    setBusy(false);
  }

  async function openChild(row: Record<string, unknown>) {
    if (!info) return;
    const pk = String(row[info.pkCol] ?? "");
    if (!pk) return;
    const note = await openRecordNote({ dbId: recordRef.dbId, table: recordRef.table, pk });
    if (note) openNotePage(note);
  }

  const indent = compact ? "pl-6 pr-2" : "pl-2 pr-2";
  return (
    <div className="mt-2 pt-1">
      <h4 className={`flex items-center gap-1.5 ${compact ? "pl-6" : "px-2"} pb-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--osio-fg-subtle)]`}>
        <Boxes size={11} /> Child records{rows.length ? ` · ${rows.length}` : ""}
      </h4>
      <div className="flex flex-col">
        {rows.map((row, i) => (
          <button
            key={String(row[info.pkCol] ?? i)}
            type="button"
            onClick={() => openChild(row)}
            className={`flex w-full items-center gap-2 rounded-md py-1 ${indent} text-left text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]`}
          >
            <span className="truncate">{childRecordLabel(row, info.pkCol)}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={handleCreate}
          disabled={busy}
          className={`flex w-full items-center gap-1.5 rounded-md py-1 ${indent} text-left text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] disabled:opacity-50`}
        >
          <Plus size={14} className="shrink-0" /> {busy ? "Adding…" : "New child record"}
        </button>
      </div>
    </div>
  );
};

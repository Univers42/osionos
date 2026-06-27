/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DatabaseBrowserParts.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { RefreshCw } from "lucide-react";

import type { BaasGraphNode } from "@/features/second-brain/baas/types";
import { cellText } from "../model/baasDatabaseData";

export const Centered: React.FC<{ title: string; hint?: string; onRetry?: () => void }> = ({ title, hint, onRetry }) => (
  <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
    <h2 className="text-lg font-semibold text-[var(--osio-fg-default)]">{title}</h2>
    {hint ? <p className="max-w-md text-sm text-[var(--osio-fg-muted)]">{hint}</p> : null}
    {onRetry ? (
      <button type="button" onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--osio-border-default)] px-3 py-1.5 text-sm hover:bg-[var(--osio-bg-hover)]">
        <RefreshCw size={14} /> Retry
      </button>
    ) : null}
  </div>
);

export const PaneHeader: React.FC<{ icon: React.ReactNode; label: string; onRefresh?: () => void }> = ({ icon, label, onRefresh }) => (
  <div className="mb-1 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--osio-fg-subtle)]">
    <span className="flex items-center gap-1.5">{icon}{label}</span>
    {onRefresh ? (
      <button type="button" onClick={onRefresh} title="Refresh" className="rounded p-1 hover:bg-[var(--osio-bg-hover)]">
        <RefreshCw size={12} />
      </button>
    ) : null}
  </div>
);

export const PickButton: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  meta?: string;
  onClick: () => void;
}> = ({ active, icon, label, meta, onClick }) => (
  <button type="button" onClick={onClick}
    className={[
      "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm",
      active ? "bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]" : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]",
    ].join(" ")}
  >
    <span className="shrink-0">{icon}</span>
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {meta ? <span className="shrink-0 text-xs text-[var(--osio-fg-subtle)]">{meta}</span> : null}
  </button>
);

export const RecordsTable: React.FC<{ columns: string[]; rows: readonly BaasGraphNode[] }> = ({ columns, rows }) => {
  if (columns.length === 0) return <p className="text-sm text-[var(--osio-fg-subtle)]">This table has no records yet.</p>;
  return (
    <div className="overflow-auto rounded-md border border-[var(--osio-border-default)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[var(--osio-bg-muted)] text-left text-[var(--osio-fg-muted)]">
            {columns.map((column) => <th key={column} className="whitespace-nowrap px-3 py-1.5 font-medium">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[var(--osio-border-default)]">
              {columns.map((column) => (
                <td key={column} className="max-w-xs truncate px-3 py-1.5 text-[var(--osio-fg-default)]">
                  {cellText(row.data?.[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

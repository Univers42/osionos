/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SqlResultTable.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import type { SqlRoResult } from "../api/sqlRoClient";

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Render read-only query rows as a scrollable table. */
export const SqlResultTable: React.FC<{ result: SqlRoResult }> = ({ result }) => {
  if (result.rows.length === 0) {
    return <p className="px-2 py-2 text-xs text-[var(--osio-fg-subtle)]">No rows.</p>;
  }
  const columns = Object.keys(result.rows[0]);
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--osio-border-default)]">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-[var(--osio-bg-subtle)]">
            {columns.map((col) => (
              <th key={col} className="border-b border-[var(--osio-border-default)] px-2 py-1 text-left font-semibold text-[var(--osio-fg-muted)]">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, index) => (
            <tr key={index} className="odd:bg-[var(--osio-bg-surface)]">
              {columns.map((col) => (
                <td key={col} className="max-w-[24ch] truncate border-b border-[var(--osio-border-default)] px-2 py-1 text-[var(--osio-fg-default)]" title={cellText(row[col])}>
                  {cellText(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.truncated && <p className="px-2 py-1 text-[10px] text-[var(--osio-fg-subtle)]">Showing the first rows (result truncated).</p>}
    </div>
  );
};

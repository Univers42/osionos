/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   VirtualRows.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface GridSection<T> {
  title?: string;
  items: T[];
}

interface GridRow<T> {
  key: string;
  header?: string;
  items?: T[];
}

const HEADER_HEIGHT = 30;
const ROW_HEIGHT = 36;

function buildRows<T>(sections: GridSection<T>[], perRow: number): GridRow<T>[] {
  const rows: GridRow<T>[] = [];
  for (const section of sections) {
    if (section.items.length === 0) continue;
    if (section.title) rows.push({ key: `h:${section.title}`, header: section.title });
    for (let i = 0; i < section.items.length; i += perRow)
      rows.push({ key: `${section.title ?? ""}:${i}`, items: section.items.slice(i, i + perRow) });
  }
  return rows;
}

/** Virtualized picker grid: fixed-height cell rows with optional sticky-free section
 *  headers, driven by the caller's scroll container. Only visible rows mount — which
 *  also means only visible lazy icon chunks / images ever load. */
export function VirtualGrid<T>({ scrollRef, sections, perRow, renderItem }: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  sections: GridSection<T>[];
  perRow: number;
  renderItem: (item: T) => React.ReactNode;
}): React.ReactElement {
  const rows = useMemo(() => buildRows(sections, perRow), [sections, perRow]);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns unmemoizable functions; the React Compiler skips this component by design (documented plugin behavior), nothing to fix here
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index]?.header !== undefined ? HEADER_HEIGHT : ROW_HEIGHT),
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 6,
  });

  return (
    <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((vRow) => {
        const row = rows[vRow.index];
        if (!row) return null;
        return (
          <div
            key={vRow.key}
            className="absolute left-0 top-0 w-full"
            style={{ height: vRow.size, transform: `translateY(${vRow.start}px)` }}
          >
            {row.header !== undefined ? (
              <div className="flex h-full items-end px-3 pb-1 text-xs font-medium text-[var(--osio-fg-muted)]">
                {row.header}
              </div>
            ) : (
              <div className="flex gap-1 px-2">{row.items?.map((item) => renderItem(item))}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

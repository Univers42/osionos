/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useExplorerVirtualizer.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";

import { renderRowKey, type RenderRow } from "../model/explorerRows";
import { EXPLORER_ROW_HEIGHT_PX } from "./WorkspaceExplorerRow";

// Ponytail: lines mounted beyond each edge of the viewport. A fling faster than this many
// lines per frame paints blank space for a frame until the virtualizer catches up; raise it
// if that shows, at the cost of more mounted rows.
const EXPLORER_OVERSCAN_LINES = 12;

/** The default range is contiguous, so a line outside it lies before or after it. */
function withLine(indexes: number[], line: number): number[] {
  if (line < 0) return indexes;
  if (indexes.length === 0) return [line];
  if (line < indexes[0]) return [line, ...indexes];
  if (line > indexes[indexes.length - 1]) return [...indexes, line];
  return indexes;
}

/** Mounts only the lines in view (plus overscan) inside the element `scrollRef` is put
 *  on. `keepMounted` (the tabbable line, -1 for none) stays mounted wherever it is, so
 *  keyboard focus survives scrolling it out of view and focus() can reach it. Heights
 *  are measured per line: a wrapped error message or the inline input is taller. */
export function useExplorerVirtualizer(rows: readonly RenderRow[], keepMounted: number) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const rangeExtractor = React.useCallback((range: Range) => withLine(defaultRangeExtractor(range), keepMounted), [keepMounted]);
  const getItemKey = React.useCallback((index: number) => {
    const row = rows[index];
    return row ? renderRowKey(row) : index;
  }, [rows]);
  // React Compiler skips this hook because of the tanstack virtualizer (library
  // limitation, informational) — the same sanctioned use as PageBlocksRenderer; the
  // row model it reads is benchmarked in tests/bench/explorer-rows.bench.ts.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => EXPLORER_ROW_HEIGHT_PX,
    getItemKey,
    overscan: EXPLORER_OVERSCAN_LINES,
    rangeExtractor,
  });
  return { scrollRef, virtualizer };
}

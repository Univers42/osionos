/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useTableCommit.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Block, TableBlockConfig } from "@/entities/block";
import { getTableColumnCount, normalizeTableData, resolveTableConfig } from "@/entities/block/model/tableBlocks";
import { usePageStore } from "@/store/usePageStore";
import { tableDataEqual, updateTableCellValue } from "./tableStructure";
import type { CellCommit, ScheduleCellCommit } from "./tableTypes";

const CELL_COMMIT_DELAY_MS = 200;

/**
 * Owns the table's draft data/config, debounced cell commits, and structural
 * commits to the page store. Keeps a `latestDataRef` so event handlers always
 * read the freshest grid without waiting for a render.
 */
export function useTableCommit(block: Block, pageId: string) {
  const updateBlock = usePageStore((state) => state.updateBlock);
  const commitTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const pendingCommitRef = useRef(false);
  const blockData = useMemo(() => normalizeTableData(block.tableData), [block.tableData]);
  const [draftData, setDraftData] = useState(blockData);
  const latestDataRef = useRef(draftData);
  const data = draftData;
  const columnCount = getTableColumnCount(data);
  const resolvedConfig = useMemo(() => resolveTableConfig({ tableConfig: block.tableConfig }, columnCount, data.length), [block.tableConfig, columnCount, data.length]);
  const [config, setConfig] = useState(resolvedConfig);
  const updateTable = useCallback((updates: Partial<Block>) => updateBlock(pageId, block.id, updates), [block.id, pageId, updateBlock]);

  useEffect(() => { latestDataRef.current = draftData; }, [draftData]);
  useEffect(() => {
    if (!pendingCommitRef.current && !tableDataEqual(blockData, latestDataRef.current)) {
      latestDataRef.current = blockData;
      setDraftData(blockData);
    }
  }, [blockData]);
  useEffect(() => { setConfig(resolvedConfig); }, [resolvedConfig]);

  const flushCellCommit = useCallback(() => {
    if (commitTimerRef.current !== null) globalThis.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = null;
    if (!pendingCommitRef.current) return;
    pendingCommitRef.current = false;
    setDraftData(latestDataRef.current);
    updateTable({ tableData: latestDataRef.current });
  }, [updateTable]);
  useEffect(() => () => flushCellCommit(), [flushCellCommit]);

  const scheduleCellCommit = useCallback<ScheduleCellCommit>((rowIndex, columnIndex, value, flush = false) => {
    latestDataRef.current = updateTableCellValue(latestDataRef.current, rowIndex, columnIndex, value);
    pendingCommitRef.current = true;
    if (flush) { flushCellCommit(); return; }
    if (commitTimerRef.current !== null) globalThis.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = globalThis.setTimeout(flushCellCommit, CELL_COMMIT_DELAY_MS);
  }, [flushCellCommit]);
  const cellCommitHandlers = useMemo(() => createCellCommitHandlers(data.length, columnCount, scheduleCellCommit), [columnCount, data.length, scheduleCellCommit]);

  const commitStructure = useCallback((nextData: string[][], nextConfig: TableBlockConfig) => {
    if (commitTimerRef.current !== null) globalThis.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = null;
    pendingCommitRef.current = false;
    latestDataRef.current = nextData;
    setDraftData(nextData);
    setConfig(nextConfig);
    updateTable({ tableData: nextData, tableConfig: nextConfig });
  }, [updateTable]);
  const commitConfig = useCallback((nextConfig: TableBlockConfig) => {
    setConfig(nextConfig);
    updateTable({ tableConfig: nextConfig });
  }, [updateTable]);

  return { data, columnCount, config, latestDataRef, scheduleCellCommit, commitStructure, commitConfig, cellCommitHandlers };
}

function createCellCommitHandlers(rowCount: number, columnCount: number, schedule: ScheduleCellCommit): CellCommit[][] {
  return Array.from({ length: rowCount }, (_, rowIndex) => createRowCommitHandlers(rowIndex, columnCount, schedule));
}

function createRowCommitHandlers(rowIndex: number, columnCount: number, schedule: ScheduleCellCommit): CellCommit[] {
  return Array.from({ length: columnCount }, (_, columnIndex) => (value, flush) => schedule(rowIndex, columnIndex, value, flush));
}

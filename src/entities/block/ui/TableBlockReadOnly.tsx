/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TableBlockReadOnly.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo } from "react";

import type { Block, TableBlockConfig, TableBlockTextAlign } from "@/entities/block";
import {
  getTableAlignmentClassName,
  getTableColumnCount,
  getTablePaddingClassName,
  normalizeTableData,
  resolveTableConfig,
} from "@/entities/block/model/tableBlocks";
import { InternalPageLink } from "@/entities/page";
import { renderInlineToReact } from "@/shared/lib/markengine";

const MAX_AUTO_COLUMN_WIDTH = 420;

interface TableBlockReadOnlyProps {
  block: Block;
}

function renderInternalPageLink(pageId: string) {
  return <InternalPageLink pageId={pageId} />;
}

const InlineMarkdown: React.FC<{ content: string }> = ({ content }) => {
  const renderedContent = useMemo(() => {
    if (!content) return null;
    return renderInlineToReact(content, {
      internalLinkRenderer: renderInternalPageLink,
    });
  }, [content]);

  return <>{renderedContent}</>;
};

export const TableBlockReadOnly: React.FC<TableBlockReadOnlyProps> = ({ block }) => {
  const data = useMemo(() => normalizeTableData(block.tableData), [block.tableData]);
  const columnCount = getTableColumnCount(data);
  const config = useMemo(() => resolveTableConfig(block, columnCount, data.length), [block, columnCount, data.length]);

  if (!data.length) {
    return (
      <div className="my-2 rounded border border-[var(--osio-border-default)] px-3 py-2 text-xs text-[var(--osio-fg-subtle)]">
        Empty table
      </div>
    );
  }

  const tableClassName = [
    "text-sm",
    config.layoutMode === "fit" ? "min-w-full w-full" : "min-w-full w-max",
    config.layoutMode === "fixed" ? "table-fixed" : "table-auto",
  ].join(" ");

  const columnStyles = Array.from({ length: columnCount }, (_, columnIndex) => {
    const explicitWidth = config.columnWidths?.[columnIndex];
    const inferredWidth = config.layoutMode === "auto"
      ? inferColumnWidth(data, columnIndex, config.minColumnWidth, config.maxColumnWidth)
      : undefined;
    const width = explicitWidth ?? inferredWidth;

    return {
      minWidth: config.minColumnWidth,
      width,
      maxWidth: config.wrap ? config.maxColumnWidth ?? MAX_AUTO_COLUMN_WIDTH : undefined,
    } satisfies React.CSSProperties;
  });

  return (
    <div className="osio-scrollbar-hidden my-2 overflow-x-auto overflow-y-visible rounded-lg border border-[var(--osio-db-line)] bg-[var(--osio-bg-surface)]">
      <table className={tableClassName} style={{ tableLayout: config.layoutMode === "fixed" ? "fixed" : "auto" }}>
        <colgroup>
          {columnStyles.map((columnStyle, columnIndex) => (
            <col
              key={`col-${columnIndex}`} // NOSONAR - table columns are position-based in tableData
              style={columnStyle}
            />
          ))}
        </colgroup>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={`row-${rowIndex}`} // NOSONAR - table rows are position-based in tableData
              className={getRowClassName(rowIndex, config)}
              style={config.rowHeights?.[rowIndex] ? { height: config.rowHeights[rowIndex] } : undefined}
            >
              {Array.from({ length: columnCount }, (_, columnIndex) => {
                const cell = row[columnIndex] ?? "";
                const alignment = config.columnAlignments?.[columnIndex] ?? null;
                return (
                  <td
                    key={`cell-${rowIndex}-${columnIndex}`} // NOSONAR - table cells are position-based in tableData
                    className={getCellClassName(config, alignment, rowIndex, columnIndex)}
                  >
                    <InlineMarkdown content={cell} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

function getRowClassName(rowIndex: number, config: TableBlockConfig): string {
  const classes = [];
  if (config.headerRow !== false && rowIndex === 0) classes.push("bg-[var(--osio-bg-subtle)] font-medium");
  if (config.stripedRows && rowIndex > 0 && rowIndex % 2 === 0) classes.push("bg-[var(--osio-bg-subtle)]/50");
  return classes.join(" ");
}

function getCellClassName(
  config: TableBlockConfig,
  alignment: TableBlockTextAlign,
  rowIndex: number,
  columnIndex: number,
): string {
  return [
    getTablePaddingClassName(config.cellPadding),
    "text-[var(--osio-fg-default)] align-top",
    getTableAlignmentClassName(alignment),
    config.wrap === false ? "truncate whitespace-nowrap" : "whitespace-normal break-words",
    config.showBorders === false ? "" : "border-b border-r border-[var(--osio-db-line)] last:border-r-0",
    config.headerColumn && columnIndex === 0 ? "font-medium bg-[var(--osio-bg-subtle)]" : "",
    config.headerRow !== false && rowIndex === 0 ? "font-medium" : "",
  ].filter(Boolean).join(" ");
}

function inferColumnWidth(
  data: string[][],
  columnIndex: number,
  minColumnWidth = 96,
  maxColumnWidth?: number,
): number {
  const longestContent = data.reduce((longest, row) => {
    const value = row[columnIndex] ?? "";
    return Math.max(longest, value.length);
  }, 0);
  const estimatedWidth = Math.max(minColumnWidth, Math.min(MAX_AUTO_COLUMN_WIDTH, longestContent * 8 + 48));
  return maxColumnWidth ? Math.min(estimatedWidth, maxColumnWidth) : estimatedWidth;
}

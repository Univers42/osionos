/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tableContextMenuSections.tsx                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { Settings2 } from "lucide-react";

import type { Block } from "@/entities/block";
import {
  getTableColumnCount,
  normalizeTableData,
  resolveTableConfig,
} from "@/entities/block/model/tableBlocks";
import type { BlockContextMenuSection } from "./blockContextMenu.helpers";

export type TableConfigUpdate = Partial<NonNullable<Block["tableConfig"]>>;

export function resolveBlockTableConfig(block: Block) {
  const tableData = normalizeTableData(block.tableData);
  return resolveTableConfig(block, getTableColumnCount(tableData), tableData.length);
}

export function createTableContextMenuSections(
  block: Block,
  handleUnavailable: () => void,
  handleSetTableConfig: (updates: TableConfigUpdate) => void,
): BlockContextMenuSection[] {
  if (block.type !== "table_block") return [];

  const tableConfig = resolveBlockTableConfig(block);
  const wrapEnabled = tableConfig.wrap !== false;
  const bordersEnabled = tableConfig.showBorders !== false;
  const headerRowEnabled = tableConfig.headerRow !== false;

  return [
    {
      label: "Table",
      items: [
        {
          icon: <Settings2 size={16} />,
          label: "Table settings",
          onClick: handleUnavailable,
          subItems: [
            {
              icon: "Auto",
              label: "Auto layout",
              active: tableConfig.layoutMode === "auto",
              onClick: () => handleSetTableConfig({ layoutMode: "auto" }),
            },
            {
              icon: "Fit",
              label: "Fit to width",
              active: tableConfig.layoutMode === "fit",
              onClick: () => handleSetTableConfig({ layoutMode: "fit" }),
            },
            {
              icon: "Fixed",
              label: "Fixed column widths",
              active: tableConfig.layoutMode === "fixed",
              onClick: () => handleSetTableConfig({ layoutMode: "fixed" }),
            },
            {
              icon: "Wrap",
              label: wrapEnabled ? "Wrap text" : "No text wrap",
              active: wrapEnabled,
              onClick: () => handleSetTableConfig({ wrap: !wrapEnabled }),
            },
            {
              icon: "80",
              label: "Compact columns",
              active: tableConfig.minColumnWidth === 80,
              onClick: () => handleSetTableConfig({ minColumnWidth: 80 }),
            },
            {
              icon: "120",
              label: "Standard columns",
              active: tableConfig.minColumnWidth === 120,
              onClick: () => handleSetTableConfig({ minColumnWidth: 120 }),
            },
            {
              icon: "180",
              label: "Wide columns",
              active: tableConfig.minColumnWidth === 180,
              onClick: () => handleSetTableConfig({ minColumnWidth: 180 }),
            },
            {
              icon: "Sm",
              label: "Compact padding",
              active: tableConfig.cellPadding === "compact",
              onClick: () => handleSetTableConfig({ cellPadding: "compact" }),
            },
            {
              icon: "Md",
              label: "Normal padding",
              active: tableConfig.cellPadding === "normal",
              onClick: () => handleSetTableConfig({ cellPadding: "normal" }),
            },
            {
              icon: "Lg",
              label: "Comfortable padding",
              active: tableConfig.cellPadding === "comfortable",
              onClick: () => handleSetTableConfig({ cellPadding: "comfortable" }),
            },
            {
              icon: "H",
              label: headerRowEnabled ? "Header row on" : "Header row off",
              active: headerRowEnabled,
              onClick: () => handleSetTableConfig({ headerRow: !headerRowEnabled }),
            },
            {
              icon: "1st",
              label: tableConfig.headerColumn ? "Header column on" : "Header column off",
              active: tableConfig.headerColumn === true,
              onClick: () => handleSetTableConfig({ headerColumn: !tableConfig.headerColumn }),
            },
            {
              icon: "#",
              label: bordersEnabled ? "Borders on" : "Borders off",
              active: bordersEnabled,
              onClick: () => handleSetTableConfig({ showBorders: !bordersEnabled }),
            },
            {
              icon: "Alt",
              label: tableConfig.stripedRows ? "Striped rows on" : "Striped rows off",
              active: tableConfig.stripedRows === true,
              onClick: () => handleSetTableConfig({ stripedRows: !tableConfig.stripedRows }),
            },
            {
              icon: "↔",
              label: "Reset column widths",
              onClick: () => handleSetTableConfig({ columnWidths: [], layoutMode: "auto" }),
            },
          ],
        },
      ],
    },
  ];
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tableTypes.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type React from "react";
import type { TableBlockConfig } from "@/entities/block";

export type Axis = "column" | "row";
export type CellCommit = (value: string, flush?: boolean) => void;
export type ScheduleCellCommit = (rowIndex: number, columnIndex: number, value: string, flush?: boolean) => void;
export type CellAddress = { rowIndex: number; columnIndex: number };
export type CaretPlacement = "start" | "end";
export type CellKeyHandler = (event: React.KeyboardEvent<HTMLDivElement>, rowIndex: number, columnIndex: number) => void;
export type CellFocusHandler = (cellId: string) => void;
export type StructuralEditRunner = (nextData: string[][], nextConfig: TableBlockConfig, target: CellAddress, placement?: CaretPlacement) => void;

export interface CellKeyContext {
  columnCount: number;
  config: TableBlockConfig;
  data: string[][];
  root: HTMLElement | null;
  source: string[][];
  focusCell: (rowIndex: number, columnIndex: number, placement?: CaretPlacement) => void;
  runStructuralEdit: StructuralEditRunner;
  enterNavigate: (cell: CellAddress) => void;
}

export interface NavigateKeyContext {
  columnCount: number;
  rowCount: number;
  setActiveCell: (cell: CellAddress) => void;
  enterEditCell: (cell: CellAddress, seed?: string) => void;
  clearCell: (cell: CellAddress) => void;
  exit: () => void;
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   types.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:03:32 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/11 16:05:14 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Standalone Block types for the playground application.
 * This replaces the external @src/types/database dependency.
 */

/** All supported block types in the playground editor. */
export type BlockType =
  | 'paragraph'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'heading_4'
  | 'heading_5'
  | 'heading_6'
  | 'bulleted_list'
  | 'numbered_list'
  | 'to_do'
  | 'toggle'
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'code'
  | 'quote'
  | 'callout'
  | 'equation'
  | 'layout'
  | 'column_list'
  | 'column'
  | 'divider'
  | 'table_block'
  | 'database_inline'
  | 'database_full_page';

export type LayoutMode = 'inline' | 'full_page';
export type LayoutGuideVisibility = 'auto' | 'always' | 'never';
export type LayoutCellSizing = 'fixed' | 'auto-height' | 'auto-width' | 'auto';
export type LayoutCellHorizontalConstraint = 'left' | 'stretch' | 'scale';
export type LayoutCellVerticalConstraint = 'top' | 'stretch' | 'hug';
export type LayoutCellPadding = 'compact' | 'comfortable' | 'spacious';
export type LayoutCellFontSize = 'small' | 'base' | 'large';
export type TableBlockLayoutMode = 'auto' | 'fit' | 'fixed';
export type TableBlockPadding = 'compact' | 'normal' | 'comfortable';
export type TableBlockTextAlign = 'left' | 'center' | 'right' | null;

export interface TableBlockConfig {
  layoutMode?: TableBlockLayoutMode;
  wrap?: boolean;
  minColumnWidth?: number;
  maxColumnWidth?: number;
  cellPadding?: TableBlockPadding;
  headerRow?: boolean;
  headerColumn?: boolean;
  showBorders?: boolean;
  stripedRows?: boolean;
  columnWidths?: Array<number | undefined>;
  rowHeights?: Array<number | undefined>;
  columnAlignments?: TableBlockTextAlign[];
}

export interface LayoutConfig {
  columns: number;
  rows?: number;
  rowHeight: number;
  gap: number;
  wrap: boolean;
  autoArrange: boolean;
  snapToGrid: boolean;
  guideVisibility: LayoutGuideVisibility;
  preview: boolean;
  theme?: 'default' | 'compact' | 'spacious';
  columnGap?: number;
  rowGap?: number;
  autoReflow?: boolean;
  showGuides?: boolean;
}

export interface LayoutCell {
  id: string;
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
  offset?: { x: number; y: number };
  label?: string;
  tint?: string;
  blocks: Block[];
  type?: 'text' | 'color' | 'spacer';
  content?: string;
  blockType?: BlockType;
  textColor?: string;
  backgroundColor?: string;
  sizing?: LayoutCellSizing;
  horizontalConstraint?: LayoutCellHorizontalConstraint;
  verticalConstraint?: LayoutCellVerticalConstraint;
  wrap?: boolean;
  padding?: LayoutCellPadding;
  fontSize?: LayoutCellFontSize;
}

/** A single content block in a page. */
export interface Block {
  id: string;
  type: BlockType;
  content: string;
  children?: Block[];		/** Children blocks (for toggle, nested lists, etc.) */
  checked?: boolean;		/** Whether a to_do is checked */
  language?: string;		/** Programming language for code blocks */
  codeView?: "preview" | "source";		/** View mode for renderable code blocks (default: preview) */
  fileName?: string;					/** Optional title/filename shown in a code block header */
  codeTheme?: "dark" | "light";			/** Per-block code card theme (default: dark) */
  lineNumbers?: boolean;				/** Show a line-number gutter in a code block */
  heightLines?: number;					/** Persisted height in lines for code blocks */
  color?: string;			/** Color for callouts, etc. */
  textColor?: string;		/** Optional block text color */
  backgroundColor?: string; /** Optional block background color */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6; /** Optional heading style inside composed blocks */
  widthRatio?: number;      /** Relative width for column blocks */
  collapsed?: boolean;		/** Whether a toggle is collapsed */
  asset?: string;           /** Serialized ui-collection asset value for media blocks */
  mediaWidth?: number;      /** Display width percentage for media blocks */
  placeholderText?: string; /** Temporary placeholder hint for empty transformed blocks */
  tableData?: string[][];	/** Table data (array of rows, each row is array of cell strings) */
  tableConfig?: TableBlockConfig; /** Presentation and sizing options for simple table blocks */
  databaseId?: string;		/** Database reference ID (for database_inline / database_full_page) */
  viewId?: string;			/** View ID for database blocks */
  layoutMode?: LayoutMode;
  layoutConfig?: Partial<LayoutConfig>;
  layoutCells?: LayoutCell[];
  schemaVersion?: number;
  [key: string]: unknown;	/** Arbitrary metadata */
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blocks.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/15 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Block surface — markdown shortcuts and the engine's own block contract.
 *
 * Separate from the root entry point because it carries the block vocabulary;
 * consumers that only parse or render inline markdown should not pay for it.
 * Pure: no React, no DOM.
 */

export {
  BLOCK_SHORTCUTS,
  detectBlockType,
  parseMarkdownToBlocks,
} from "./markdown/shortcuts";
export type { BlockDetection } from "./shortcutsDetect";

export type {
  MarkEngineBlock,
  MarkEngineBlockType,
  MarkEngineHeadingLevel,
} from "./blockContract";

export {
  DEFAULT_TABLE_CONFIG,
  DEFAULT_TABLE_DATA,
  clampTableColumnWidth,
  clampTableRowHeight,
  createTableBlockFromData,
  getDefaultTableConfig,
  getTableColumnCount,
  normalizeTableData,
  resolveTableConfig,
} from "./tableConfig";
export type {
  TableBlockConfig,
  TableBlockLayoutMode,
  TableBlockPadding,
  TableBlockSeed,
  TableBlockTextAlign,
} from "./tableConfig";

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockContract.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/15 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The engine's own block vocabulary — the contract it emits against.
 *
 * markengine does not import the host's `Block`: a markdown engine that depends
 * on one app's entity layer cannot be reused by another. Instead it declares the
 * shape it produces, and the host proves compatibility once (see the host-side
 * guard that asserts `MarkEngineBlockType extends BlockType` and that a
 * `MarkEngineBlock` is assignable to the host `Block`).
 *
 * Adding a type here that the host does not know fails that single guard file —
 * one clear error instead of thirty scattered ones.
 */

import type { TableBlockConfig } from './tableConfig';

export type MarkEngineBlockType =
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
  | 'button'
  | 'table_block'
  | 'database_inline'
  | 'database_full_page'
  | 'graph_view'
  | 'draw'
  | 'home_views'
  | 'placeholder';

export type MarkEngineHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Only the fields the engine actually writes. The index signature keeps hosts
 * with richer block models structurally compatible without a cast, and lets
 * fenced app-blocks carry through arbitrary extra config.
 */
export interface MarkEngineBlock {
  id: string;
  type: MarkEngineBlockType;
  content: string;
  children?: MarkEngineBlock[];
  checked?: boolean;
  language?: string;
  color?: string;
  headingLevel?: MarkEngineHeadingLevel;
  widthRatio?: number;
  asset?: string;
  mediaAlt?: string;
  fileName?: string;
  drawHeight?: number;
  tableData?: string[][];
  tableConfig?: TableBlockConfig;
  [key: string]: unknown;
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   types.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:03:32 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 21:26:11 by dlesieur         ###   ########.fr       */
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

/** A single content block in a page. */
export interface Block {
  id: string;
  type: BlockType;
  content: string;
  children?: Block[];		/** Children blocks (for toggle, nested lists, etc.) */
  checked?: boolean;		/** Whether a to_do is checked */
  language?: string;		/** Programming language for code blocks */		
  color?: string;			/** Color for callouts, etc. */
  textColor?: string;		/** Optional block text color */
  backgroundColor?: string; /** Optional block background color */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6; /** Optional heading style inside composed blocks */
  widthRatio?: number;      /** Relative width for column blocks */
  collapsed?: boolean;		/** Whether a toggle is collapsed */
  asset?: string;           /** Serialized ui-collection asset value for media blocks */
  placeholderText?: string; /** Temporary placeholder hint for empty transformed blocks */
  tableData?: string[][];	/** Table data (array of rows, each row is array of cell strings) */
  databaseId?: string;		/** Database reference ID (for database_inline / database_full_page) */
  viewId?: string;			/** View ID for database blocks */
  [key: string]: unknown;	/** Arbitrary metadata */
}

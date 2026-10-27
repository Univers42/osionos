/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   templateBlocks.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Shared block builders for the template pages: the admin-designed ones and the
// profession profile templates. Layout/cell shapes mirror seedPages.ts
// containmentFixture; the metric card matches the WS3 spec (a layout cell of
// [heading_1(value), paragraph(label)]).

import type { Block, LayoutCell } from '@/entities/block';
import { bid } from '../seedBlockHelpers';

/** Grid placement for a layout cell. */
export interface Placement {
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
}

/** An embedded database view block. */
export function dbInline(databaseId: string, viewId: string): Block {
  return { id: bid(), type: 'database_inline', content: '', databaseId, viewId };
}

/**
 * A field bound to the record in context ($record) — renders the user/app value. The id
 * is a parameter (and not minted here) so a template keeps its block ids stable: a
 * re-seed then replaces the same block instead of piling a new one up.
 */
export function bound(blockId: string, fieldBind: string, headingLevel?: 1 | 2 | 3): Block {
  return {
    id: blockId,
    type: headingLevel ? (`heading_${headingLevel}` as Block['type']) : 'paragraph',
    content: '',
    recordRef: '$record',
    fieldBind,
    ...(headingLevel ? { headingLevel } : {}),
  };
}

/** A heading with an explicit id — stable ids let a re-seed replace the same block. */
export function heading(blockId: string, text: string, level: 1 | 2 | 3): Block {
  return { id: blockId, type: `heading_${level}` as Block['type'], content: text, headingLevel: level };
}

/**
 * The three bound groups every profile shell opens with — header (name + headline),
 * about (bio) and details (role + location) — mirroring the admin's profile template.
 * The ids are derived from `prefix`, so a re-seed replaces the same blocks.
 */
export function profileShell(prefix: string): Block[] {
  return [
    bound(`${prefix}-1`, 'displayName', 1),
    bound(`${prefix}-2`, 'headline'),
    heading(`${prefix}-3`, 'About', 3),
    bound(`${prefix}-4`, 'bio'),
    heading(`${prefix}-5`, 'Details', 3),
    bound(`${prefix}-6`, 'role'),
    bound(`${prefix}-7`, 'location'),
  ];
}

/** A KaTeX equation block (content is the LaTeX source). */
export function equation(latex: string): Block {
  return { id: bid(), type: 'equation', content: latex };
}

/** A single fixed layout cell. */
export function cell(placement: Placement, label: string, blocks: Block[]): LayoutCell {
  return { id: bid(), ...placement, label, blocks, sizing: 'fixed' };
}

/** A 12-column inline layout grid wrapping the given cells. */
export function layoutGrid(rows: number, cells: LayoutCell[]): Block {
  return {
    id: bid(),
    type: 'layout',
    content: '',
    layoutMode: 'inline',
    layoutConfig: {
      columns: 12, rows, gap: 16, rowHeight: 180,
      wrap: true, autoArrange: false, snapToGrid: true,
      guideVisibility: 'auto', preview: false,
    },
    layoutCells: cells,
  };
}

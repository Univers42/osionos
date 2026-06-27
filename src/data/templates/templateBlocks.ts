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

// Shared block builders for the admin-designed template pages. Layout/cell
// shapes mirror seedPages.ts containmentFixture; the metric card matches the
// WS3 spec (a layout cell of [heading_1(value), paragraph(label)]).

import type { Block, LayoutCell } from '@/entities/block';
import { bid, h1, p } from '../seedBlockHelpers';

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

/** A KaTeX equation block (content is the LaTeX source). */
export function equation(latex: string): Block {
  return { id: bid(), type: 'equation', content: latex };
}

/** A single fixed layout cell. */
export function cell(placement: Placement, label: string, blocks: Block[]): LayoutCell {
  return { id: bid(), ...placement, label, blocks, sizing: 'fixed' };
}

/** A metric/stat card: big value over a small label. */
export function metricCell(placement: Placement, value: string, label: string): LayoutCell {
  return cell(placement, label, [h1(value), p(label)]);
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

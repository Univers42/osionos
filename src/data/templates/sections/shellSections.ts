/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   shellSections.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The four "/" page shells: each ONE full-page layout block whose cells are
// named by region — the skeleton the dashboard templates are built on. The
// sidebars collapse on tablet widths and stick while scrolling; main collapses
// too, so it spans full width when they stack. T1a's readers already render
// the fields, so nothing here needs a renderer of its own.

import type { Block, LayoutCell } from '@/entities/block';
import { bid, p } from '../../seedBlockHelpers';

type ShellRegion = 'header' | 'left' | 'main' | 'right' | 'footer';
type ShellPlacement = Pick<LayoutCell, 'colStart' | 'colSpan' | 'rowStart' | 'rowSpan'>;

/** One region cell: its label, an empty paragraph and the region's own fields
 *  (sidebars collapse on tablet and stick; main only collapses; bands neither). */
function shellCell(placement: ShellPlacement, label: string, region: ShellRegion): LayoutCell {
  const sidebar = region === 'left' || region === 'right';
  const cell: LayoutCell = { id: bid(), ...placement, label, region, blocks: [p('')] };
  if (sidebar || region === 'main') cell.stackAt = 'tablet';
  if (sidebar) cell.sticky = true;
  return cell;
}

/** The one block every shell is: an empty full-page layout, twelve columns. */
function shellBlock(cells: LayoutCell[]): Block {
  return {
    id: bid(),
    type: 'layout',
    content: '',
    layoutMode: 'full_page',
    layoutConfig: { columns: 12, rowHeight: 96, gap: 16 },
    layoutCells: cells,
  };
}

/** Two sidebars around the main column: header, left, main, right, footer. */
export function twoSidebarsShell(): Block[] {
  return [shellBlock([
    shellCell({ colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1 }, 'Header', 'header'),
    shellCell({ colStart: 1, colSpan: 3, rowStart: 2, rowSpan: 1 }, 'Sidebar', 'left'),
    shellCell({ colStart: 4, colSpan: 6, rowStart: 2, rowSpan: 1 }, 'Main', 'main'),
    shellCell({ colStart: 10, colSpan: 3, rowStart: 2, rowSpan: 1 }, 'Sidebar', 'right'),
    shellCell({ colStart: 1, colSpan: 12, rowStart: 3, rowSpan: 1 }, 'Footer', 'footer'),
  ])];
}

/** One sidebar on the left: header, left, main, footer. */
export function leftSidebarShell(): Block[] {
  return [shellBlock([
    shellCell({ colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1 }, 'Header', 'header'),
    shellCell({ colStart: 1, colSpan: 3, rowStart: 2, rowSpan: 1 }, 'Sidebar', 'left'),
    shellCell({ colStart: 4, colSpan: 9, rowStart: 2, rowSpan: 1 }, 'Main', 'main'),
    shellCell({ colStart: 1, colSpan: 12, rowStart: 3, rowSpan: 1 }, 'Footer', 'footer'),
  ])];
}

/** One sidebar on the right: header, main, right, footer. */
export function rightSidebarShell(): Block[] {
  return [shellBlock([
    shellCell({ colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1 }, 'Header', 'header'),
    shellCell({ colStart: 1, colSpan: 9, rowStart: 2, rowSpan: 1 }, 'Main', 'main'),
    shellCell({ colStart: 10, colSpan: 3, rowStart: 2, rowSpan: 1 }, 'Sidebar', 'right'),
    shellCell({ colStart: 1, colSpan: 12, rowStart: 3, rowSpan: 1 }, 'Footer', 'footer'),
  ])];
}

/** No sidebars, just the bands: header, main, footer. */
export function headerFooterShell(): Block[] {
  return [shellBlock([
    shellCell({ colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1 }, 'Header', 'header'),
    shellCell({ colStart: 1, colSpan: 12, rowStart: 2, rowSpan: 1 }, 'Main', 'main'),
    shellCell({ colStart: 1, colSpan: 12, rowStart: 3, rowSpan: 1 }, 'Footer', 'footer'),
  ])];
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   gradeCalculator.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { SeedPage } from '../seedBlockHelpers';
import { h1, p, callout } from '../seedBlockHelpers';
import { metricCell, layoutGrid, dbInline } from './templateBlocks';

/** A weighted grade calculator backed by the Grades database (live formula column). */
export const gradeCalculator: SeedPage = {
  _id: 'tpl-grade-calculator',
  title: 'Grade Calculator',
  icon: '🧮',
  workspaceId: 'mock-ws-private-0',
  ownerId: 'mock-user-0',
  isTemplate: true,
  templateSurface: 'grade-calculator',
  content: [
    h1('Grade Calculator'),
    callout('Enter each component\'s weight (as a percent) and your score (0–100). The Weighted column multiplies them, and the weights add up to 100%.', '🧮'),
    dbInline('db-grades', 'v-grades-table'),
    layoutGrid(1, [
      metricCell({ colStart: 1, colSpan: 4, rowStart: 1, rowSpan: 1 }, '86', 'Weighted total'),
    ]),
    p('Change a score in the table above and the Weighted column recomputes — no manual math.'),
  ],
};

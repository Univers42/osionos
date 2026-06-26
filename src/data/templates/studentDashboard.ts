/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   studentDashboard.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { SeedPage } from '../seedBlockHelpers';
import { h1, h2, p, callout } from '../seedBlockHelpers';
import { cell, metricCell, layoutGrid, dbInline } from './templateBlocks';

/** A student's term at a glance: hero greeting, key metrics, assignments and schedule. */
export const studentDashboard: SeedPage = {
  _id: 'tpl-student-dashboard',
  title: 'Student Dashboard',
  icon: '📚',
  workspaceId: 'mock-ws-private-0',
  ownerId: 'mock-user-0',
  isTemplate: true,
  templateSurface: 'student-dashboard',
  content: [
    layoutGrid(1, [
      cell({ colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 1 }, 'Greeting', [
        h1('Student Dashboard'),
        p('Your term at a glance — keep grades, deadlines, and classes in one place.'),
      ]),
      metricCell({ colStart: 7, colSpan: 2, rowStart: 1, rowSpan: 1 }, '3.7', 'GPA'),
      metricCell({ colStart: 9, colSpan: 2, rowStart: 1, rowSpan: 1 }, '15', 'Credits this term'),
      metricCell({ colStart: 11, colSpan: 2, rowStart: 1, rowSpan: 1 }, 'Fri', 'Next deadline'),
    ]),
    h2('Assignments'),
    dbInline('db-tasks', 'v-tasks-board'),
    h2('Schedule'),
    dbInline('db-events', 'v-events-upcoming'),
    callout('Study tip: block out two focused hours before each deadline, and review the day\'s notes the night before class.', '💡'),
  ],
};

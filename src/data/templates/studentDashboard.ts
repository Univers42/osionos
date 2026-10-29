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
import { dbInline } from './templateBlocks';

/**
 * A student's term at a glance: greeting, assignments and schedule.
 * No GPA or credit tiles: no database backs them, and a typed-in figure goes stale.
 */
export const studentDashboard: SeedPage = {
  _id: 'tpl-student-dashboard',
  title: 'Student Dashboard',
  icon: '📚',
  workspaceId: 'mock-ws-private-0',
  ownerId: 'mock-user-0',
  isTemplate: true,
  content: [
    h1('Student Dashboard'),
    p('Your term at a glance — keep grades, deadlines, and classes in one place.'),
    h2('Assignments'),
    dbInline('db-tasks', 'v-tasks-board'),
    h2('Schedule'),
    dbInline('db-events', 'v-events-upcoming'),
    callout('Study tip: block out two focused hours before each deadline, and review the day\'s notes the night before class.', '💡'),
  ],
};

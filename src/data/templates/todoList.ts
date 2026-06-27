/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   todoList.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { SeedPage } from '../seedBlockHelpers';
import { h1, h2, p, todo, callout } from '../seedBlockHelpers';
import { dbInline } from './templateBlocks';

/** A simple to-do list grouped by horizon, backed by the Tasks board. */
export const todoList: SeedPage = {
  _id: 'tpl-todo-list',
  title: 'To-Do List',
  icon: '✅',
  workspaceId: 'mock-ws-private-0',
  ownerId: 'mock-user-0',
  isTemplate: true,
  templateSurface: 'todo-list',
  content: [
    h1('To-Do List'),
    p('Capture everything here, then sort it into Today, This week, and Someday so nothing slips.'),
    h2('Today'),
    todo('Reply to the messages that need an answer'),
    todo('Finish the top-priority task'),
    todo('Take a short break to reset'),
    h2('This week'),
    todo('Plan the week ahead'),
    todo('Tidy up your notes'),
    todo('Prepare for the next meeting'),
    h2('Someday'),
    todo('Read the long article you saved'),
    todo('Learn one new keyboard shortcut'),
    h2('Tracked tasks'),
    dbInline('db-tasks', 'v-tasks-board'),
    callout('Repeat a chore by duplicating its task — recurring work stays out of your head and on the board.', '🔁'),
  ],
};

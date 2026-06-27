/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   classNotes.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { SeedPage } from '../seedBlockHelpers';
import { h1, h2, h3, p, bullet, toggle, callout } from '../seedBlockHelpers';
import { equation } from './templateBlocks';

/** One page per course: a collapsible toggle per lecture, plus a key formula and summary. */
export const classNotes: SeedPage = {
  _id: 'tpl-class-notes',
  title: 'Class Notes',
  icon: '📝',
  workspaceId: 'mock-ws-private-0',
  ownerId: 'mock-user-0',
  isTemplate: true,
  templateSurface: 'class-notes',
  content: [
    h1('Class Notes'),
    callout('One page per course. Keep a toggle per lecture so the page stays scannable as the term grows.', '📝'),
    toggle('Lecture 1 — Introduction', [
      h3('Overview'),
      p('What the course covers and how it is graded.'),
      bullet('Key term: define it in your own words'),
      bullet('Question to revisit later'),
    ]),
    toggle('Lecture 2 — Core concepts', [
      h3('Main idea'),
      p('The central concept and why it matters.'),
      bullet('Example worked through in class'),
      bullet('Common mistake to avoid'),
    ]),
    toggle('Lecture 3 — Applications', [
      h3('In practice'),
      p('Where the concept shows up in real problems.'),
      bullet('Worked example'),
      bullet('Reference for the homework'),
    ]),
    toggle('Lecture 4 — Review', [
      h3('Recap'),
      p('Tie the pieces together before the exam.'),
      bullet('Topics most likely to be tested'),
      bullet('Formulas to memorize'),
    ]),
    h2('Key formula'),
    equation('\\text{Final grade} = \\sum_i w_i \\cdot s_i'),
    h2('Summary'),
    callout('Rewrite each lecture in three sentences within a day — that is when notes turn into memory.', '✅'),
  ],
};

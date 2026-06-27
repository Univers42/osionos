/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   resume.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { SeedPage } from '../seedBlockHelpers';
import { h1, h2, h3, p, bullet, divider } from '../seedBlockHelpers';
import { cell, layoutGrid } from './templateBlocks';

/** A two-column resume: contact/skills/education sidebar beside experience and projects. */
export const resume: SeedPage = {
  _id: 'tpl-resume',
  title: 'Resume',
  icon: '📄',
  workspaceId: 'mock-ws-private-0',
  ownerId: 'mock-user-0',
  isTemplate: true,
  templateSurface: 'resume',
  content: [
    layoutGrid(1, [
      cell({ colStart: 1, colSpan: 5, rowStart: 1, rowSpan: 1 }, 'Sidebar', [
        h2('Contact'),
        bullet('your.email@example.com'),
        bullet('+1 (555) 010-0000'),
        bullet('City, Country'),
        divider(),
        h2('Skills'),
        bullet('Skill one'),
        bullet('Skill two'),
        bullet('Skill three'),
        divider(),
        h2('Education'),
        bullet('Degree — School, Year'),
        bullet('Relevant coursework'),
      ]),
      cell({ colStart: 6, colSpan: 7, rowStart: 1, rowSpan: 1 }, 'Main', [
        h1('Your Name'),
        p('A one-line summary of who you are and the kind of work you are looking for.'),
        divider(),
        h2('Experience'),
        h3('Job Title — Company (Year–Year)'),
        bullet('What you owned and the result you delivered'),
        bullet('A measurable win, stated with a number'),
        h3('Job Title — Company (Year–Year)'),
        bullet('A responsibility and its outcome'),
        divider(),
        h2('Projects'),
        bullet('Project name — what it does and the tools you used'),
        bullet('Project name — the problem it solved'),
      ]),
    ]),
  ],
};

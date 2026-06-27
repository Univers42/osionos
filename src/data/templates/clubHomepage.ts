/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   clubHomepage.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { SeedPage } from '../seedBlockHelpers';
import { h1, h2, p, button, callout } from '../seedBlockHelpers';
import { cell, layoutGrid, dbInline } from './templateBlocks';

/** A club landing page: hero, call-to-action buttons, members gallery and events. */
export const clubHomepage: SeedPage = {
  _id: 'tpl-club-homepage',
  title: 'Club Homepage',
  icon: '🎯',
  workspaceId: 'mock-ws-private-0',
  ownerId: 'mock-user-0',
  isTemplate: true,
  templateSurface: 'club-homepage',
  content: [
    layoutGrid(1, [
      cell({ colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1 }, 'Hero', [
        h1('Club Homepage'),
        p('Welcome! Everything you need to join, meet the members, and see what is coming up.'),
      ]),
    ]),
    button('Join the club', 'page://tpl-club-homepage', 'primary'),
    button('Upcoming events', undefined, 'secondary'),
    h2('Members'),
    dbInline('db-learn', 'v-learn-cards'),
    h2('Events'),
    dbInline('db-events', 'v-events-upcoming'),
    callout('New members welcome — no experience needed, just curiosity.', '🎉'),
    callout('Meetings run every other week. Check the events list for the next date.', '📣'),
  ],
};

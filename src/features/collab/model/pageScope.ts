/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageScope.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Which realtime events belong to ONE page and which belong to the workspace.
 * Kept as a tiny pure module so the transport adapter, the store and the tests
 * agree on the split instead of each repeating the list.
 *
 * `pages` is the only workspace-scoped event: it is a "the sidebar changed"
 * nudge reduced to `{t, actor, seq, workspaceId}` (C516). Everything else is
 * page-scoped and must carry the page it concerns (C501/C502).
 */

import type { CollabEvent } from './realtimeTransport.port';

export const PAGE_SCOPED_EVENT_TYPES = [
  'blocks', 'caret', 'selection', 'focus', 'note', 'file', 'activity', 'nav',
] as const;

export type PageScopedEventType = (typeof PAGE_SCOPED_EVENT_TYPES)[number];

const PAGE_SCOPED = new Set<string>(PAGE_SCOPED_EVENT_TYPES);

/** True when the event must travel on `collabpage:<pageId>`, never on the workspace topic. */
export function isPageScopedEvent(event: CollabEvent): boolean {
  return PAGE_SCOPED.has(event.t);
}

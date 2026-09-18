/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   readOnlyPersist.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/16 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/16 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { NotionState } from "@notion-db/object-database";

type ViewState = Pick<NotionState, "databases" | "pages" | "views">;

/** Stand-in time for a record with no `updatedAt`. It must be a constant: `new Date()`
 *  made every reload differ from the last, which reads as an edit and reloads again. */
export const UNKNOWN_TIME = "1970-01-01T00:00:00.000Z";

/** Did an in-view edit change what a read-only projection shows?
 *  The ObjectDatabase host calls persistState after every store change, including the
 *  reload a read-only adapter requests to discard an edit. A reload rebuilds every object,
 *  so identity cannot tell the two apart; content can. A reload of unchanged data compares
 *  equal and ends the cycle, so an adapter that re-emits only on `true` settles after at
 *  most two reloads instead of re-rendering forever. No baseline, nothing to discard. */
export function viewStateChanged(next: ViewState, previous?: ViewState): boolean {
  if (!previous) return false;
  return JSON.stringify([next.databases, next.pages, next.views])
    !== JSON.stringify([previous.databases, previous.pages, previous.views]);
}

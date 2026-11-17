/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   knownDatabaseUnload.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The page events that end a known-database session (groot ADR 0055 J-C4). A hidden tab can be
// discarded without a pagehide (mobile, frozen background tabs), and Firefox loses a localStorage
// write made at pagehide on tab close, so the pending state is committed and the journal written
// at hidden, then again at pagehide. A tab that comes back removes its journal: its next edits
// travel by their own commits, and a journal left behind would lay an older copy over them.

import type { KnownDatabasePersistence } from "./knownDatabasePersistence";

export interface UnloadHandlers {
  /** Commits the pending state, if any; pushNow at pagehide, where nothing later is awaited. */
  flushPending(pushNow: boolean): void;
  persistence(): KnownDatabasePersistence | null;
}

type VisibilityTarget = Pick<EventTarget, "addEventListener"> & { readonly visibilityState: DocumentVisibilityState };

export function watchKnownDatabaseUnload(handlers: UnloadHandlers, page: Pick<EventTarget, "addEventListener">, doc: VisibilityTarget | undefined): void {
  page.addEventListener("pagehide", () => {
    handlers.flushPending(true);
    handlers.persistence()?.writeUnloadJournal();
  });
  doc?.addEventListener("visibilitychange", () => {
    const persistence = handlers.persistence();
    if (persistence?.mode() !== "idb") return;
    if (doc.visibilityState === "visible") {
      persistence.forgetUnloadJournal();
      return;
    }
    handlers.flushPending(false);
    persistence.writeUnloadJournal();
  });
}

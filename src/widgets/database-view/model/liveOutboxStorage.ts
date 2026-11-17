/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   liveOutboxStorage.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The live databases' outbox holds edits the server has not confirmed: user content whose only
// copy is the browser's (ADR 0056 A5). A refused write makes room from the page caches; one still
// refused is shown once, and the queue keeps the edit in memory and still sends it.
// Caveat: making room evicts every workspace page cache, so each page is refetched on its next
// open; an outbox refused even then is lost if the tab closes before the server confirms it.

import type { LiveQueueStorage } from "@/shared/notion-database-sys/src/store/live/liveWriteQueue";
import { noticingWriter } from "@/shared/lib/storage-full/noticingWrite";
import { setItemEvictingPageCaches } from "@/store/pageStore.helpers";

const writeUnsentEdits = noticingWriter("Unsent database edits", setItemEvictingPageCaches);

/** The storage LiveMountAdapter gives its outbox: localStorage reads, room-making noticed writes
 *  that never throw. */
export const liveOutboxStorage: LiveQueueStorage = {
  getItem: (key) => globalThis.localStorage?.getItem(key) ?? null,
  setItem: (key, value) => {
    writeUnsentEdits(key, value);
  },
};

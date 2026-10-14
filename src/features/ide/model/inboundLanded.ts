/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundLanded.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The page side of the last inbound apply or create at each path (C3b5 P3'). The
// ledger holds the hash of the SHELL text; the page that text made has another
// canonical text (front-matter id, `updated:`), so a second shell save landing
// before the outbound writer rewrites the file read as "ours moved too" — a false
// conflict (R2, R3). While the ledger still holds that shell write, "ours unchanged"
// also accepts the page hash remembered here. Echo never reads it (C3.4).

import { sha16 } from "./ideFsEcho";
import { isStaleOwnWrite, syncedHashOf } from "./ideSyncEngine";

export interface LandedMemo {
  /** An inbound apply or create landed at `path`: remember the shell text's hash and
   *  the page's own text hash, read from the store now. */
  remember(path: string, fileHash: string, pageId: string): Promise<void>;
  /** The remembered page hash while the ledger at `path` still holds that shell text and
   *  `inboundHash` is not a write of ours the ledger moved past (C3.3); else null. O(1). */
  pageHashAt(path: string, inboundHash: string): string | null;
}

export interface LandedDeps {
  workspaceId: string;
  /** The facade's readContent: the text the app would write for the page now. */
  readText(pageId: string): Promise<string>;
}

/**
 * Ponytail: session memory only — never persisted, never in the ledger
 * (`osio.ide.synced.v1` keeps plain hashes), one entry per path for the session's
 * life. The page hash is the file text, so any change the file shows makes it miss
 * and the next save conflicts as it did before (the safe direction); `updatedAt`
 * is not in the file (finding 19), so a server merge that only moves it does not.
 */
export function createLandedMemo(deps: LandedDeps): LandedMemo {
  const landed = new Map<string, { file: string; page: string }>();
  return {
    async remember(path, fileHash, pageId) {
      let text: string;
      try {
        text = await deps.readText(pageId);
      } catch {
        landed.delete(path); // no page text, no acceptance: the next save decides as before
        return;
      }
      landed.set(path, { file: fileHash, page: await sha16(text) });
    },
    pageHashAt(path, inboundHash) {
      const hit = landed.get(path);
      if (hit === undefined || syncedHashOf(deps.workspaceId, path) !== hit.file) return null;
      return isStaleOwnWrite(deps.workspaceId, path, inboundHash) ? null : hit.page;
    },
  };
}

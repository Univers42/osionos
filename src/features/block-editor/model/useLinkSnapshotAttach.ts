/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useLinkSnapshotAttach.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// The one place a user's choice (Bookmark, Embed, Mention, Turn into) starts resolving a
// URL. Paste never calls it (C18); the result is written without an undo step, so undo
// reverts the user's choice, not the later metadata arrival.

import { useCallback } from "react";
import type { Block } from "@/entities/block";
import { resolveLinkSnapshot } from "./linkSnapshot";
import { applySnapshot, requestedUrl, type SnapshotRequest } from "./linkSnapshotApply";

export function useLinkSnapshotAttach(
  readLatestContent: () => Block[],
  writeContent: (blocks: Block[]) => void,
) {
  return useCallback(
    (request: SnapshotRequest) => {
      resolveLinkSnapshot(requestedUrl(request)).then(
        (snapshot) => {
          const current = readLatestContent();
          const next = applySnapshot(current, request, snapshot);
          if (next !== current) writeContent(next);
        },
        (error: unknown) => {
          console.warn("link preview unavailable, keeping the plain URL", error);
        },
      );
    },
    [readLatestContent, writeContent],
  );
}

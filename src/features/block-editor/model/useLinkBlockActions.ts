/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useLinkBlockActions.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useContext, useEffect, useState } from "react";

import type { Block } from "@/entities/block";
import { embedHintById, type EmbedHint } from "@/shared/lib/embed/embedHints";

import { resolveLinkSnapshot } from "./linkSnapshot";
import { EditorSurfaceIdContext } from "./editorSurfaceId";
import { peekLinkDialogRequest, takeLinkDialogRequest } from "./linkDialogRequests";

/** State and commits behind an embed/bookmark block: the dialog (opened by a click or by a
 *  slash shortcut's transient request) and the one-shot resolve after the user submits.
 *  Nothing here runs on paste; a snapshot is fetched only for a link the user chose. */
export function useLinkBlockActions(block: Block, onUpdateBlock: (updates: Partial<Block>) => void) {
  // Peeked at first render and cleared in the effect below: a StrictMode double render
  // must still see the request.
  const surfaceId = useContext(EditorSurfaceIdContext);
  const [initialRequest] = useState(() => peekLinkDialogRequest(surfaceId, block.id));
  const [isDialogOpen, setIsDialogOpen] = useState(initialRequest !== null);
  const [hint, setHint] = useState<EmbedHint | undefined>(() => embedHintById(initialRequest?.hintId));
  const [resolvingUrl, setResolvingUrl] = useState<string | null>(null);

  useEffect(() => {
    takeLinkDialogRequest(surfaceId, block.id);
  }, [surfaceId, block.id]);

  const openDialog = useCallback(() => setIsDialogOpen(true), []);
  const closeDialog = useCallback(() => {
    setIsDialogOpen(false);
    setHint(undefined);
  }, []);

  /** One update with the URL and its snapshot, so they never land apart. A failed lookup
   *  still commits the URL (the view then degrades to a host card). The write is keyed on
   *  the block and applied to the page as it is when the lookup returns, so a lookup that
   *  outlives the editor cannot overwrite newer edits (and is dropped if the block is gone). */
  const commitUrl = useCallback(
    async (url: string) => {
      setResolvingUrl(url);
      let embed;
      try {
        embed = await resolveLinkSnapshot(url);
      } catch {
        embed = undefined;
      }
      try {
        onUpdateBlock({ content: url, embed, embedHeight: undefined });
      } finally {
        setResolvingUrl(null);
      }
    },
    [onUpdateBlock],
  );

  const convertTo = useCallback((type: "embed" | "bookmark") => onUpdateBlock({ type }), [onUpdateBlock]);

  return { isDialogOpen, hint, resolvingUrl, openDialog, closeDialog, commitUrl, convertTo };
}

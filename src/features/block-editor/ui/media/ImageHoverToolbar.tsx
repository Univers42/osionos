/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ImageHoverToolbar.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useMemo, useState } from "react";
import { Captions, Download, Link, Maximize2, MessageSquare, MoreHorizontal } from "lucide-react";
import { BlockContextMenu } from "../BlockContextMenu";
import type { BlockContextMenuState } from "../../model/blockContextMenu.helpers";
import { useImageBlockActions } from "./useImageBlockActions";
import { buildImageMenuSections } from "./imageBlockMenu";

interface ImageHoverToolbarProps {
  pageId: string;
  blockId: string;
  url: string | undefined;
  altText: string;
  onCaption: () => void;
  onFullScreen: () => void;
  onReplace: () => void;
  onAltText: () => void;
}

const BTN =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]/40";

export const ImageHoverToolbar: React.FC<ImageHoverToolbarProps> = ({
  pageId,
  blockId,
  url,
  altText,
  onCaption,
  onFullScreen,
  onReplace,
  onAltText,
}) => {
  const [menu, setMenu] = useState<BlockContextMenuState | null>(null);
  const actions = useImageBlockActions(pageId, blockId, url, altText);

  const openMenu = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setMenu({ blockId, x: rect.right, y: rect.bottom + 4 });
    },
    [blockId],
  );

  const closeMenu = useCallback(() => setMenu(null), []);
  const withClose = useCallback(
    (fn: () => void) => () => {
      fn();
      setMenu(null);
    },
    [],
  );

  const runToolbar = useCallback(
    (event: React.MouseEvent, fn: () => void) => {
      event.stopPropagation();
      fn();
    },
    [],
  );

  const sections = useMemo(
    () =>
      buildImageMenuSections({
        replace: withClose(onReplace),
        copyImage: withClose(actions.copyImage),
        download: withClose(actions.download),
        caption: withClose(onCaption),
        addLink: withClose(actions.addLink),
        altText: withClose(onAltText),
        fullScreen: withClose(onFullScreen),
        viewOriginal: withClose(actions.viewOriginal),
        copyImageUrl: withClose(actions.copyImageUrl),
        copyBlockLink: withClose(actions.copyBlockLink),
        duplicate: withClose(actions.duplicate),
        moveTo: withClose(actions.moveTo),
        remove: withClose(actions.remove),
        comment: withClose(actions.comment),
        suggestEdits: withClose(actions.suggestEdits),
        askAI: withClose(actions.askAI),
      }),
    [actions, onAltText, onCaption, onFullScreen, onReplace, withClose],
  );

  return (
    <>
      <div
        role="toolbar"
        aria-label="Image actions"
        className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-0.5 opacity-0 shadow-md transition-opacity group-hover/media:pointer-events-auto group-hover/media:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100"
      >
        <button type="button" aria-label="Comment" title="Comment" className={BTN} onClick={(e) => runToolbar(e, actions.comment)}>
          <MessageSquare size={16} />
        </button>
        <button type="button" aria-label="Caption" title="Caption" className={BTN} onClick={(e) => runToolbar(e, onCaption)}>
          <Captions size={16} />
        </button>
        <button type="button" aria-label="Full screen" title="Full screen" className={BTN} onClick={(e) => runToolbar(e, onFullScreen)}>
          <Maximize2 size={16} />
        </button>
        <button type="button" aria-label="Download" title="Download" className={BTN} onClick={(e) => runToolbar(e, actions.download)}>
          <Download size={16} />
        </button>
        <button type="button" aria-label="Copy link" title="Copy link" className={BTN} onClick={(e) => runToolbar(e, actions.copyImageUrl)}>
          <Link size={16} />
        </button>
        <button type="button" aria-label="More options" title="More" className={BTN} onClick={openMenu}>
          <MoreHorizontal size={16} />
        </button>
      </div>
      <BlockContextMenu menu={menu} sections={sections} onClose={closeMenu} width={248} />
    </>
  );
};

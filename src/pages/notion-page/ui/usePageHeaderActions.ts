/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePageHeaderActions.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useState } from "react";

import { usePageStore } from "@/store/usePageStore";
import { randomUiCollectionEmoji } from "@/shared/lib/markengine/uiCollectionAssets";
import { patchActivePageMetadata } from "./notionPageMeta";

/** Icon + cover actions for the page header, plus the cover-picker popover state. */
export function usePageHeaderActions(pageId: string, locked: boolean) {
  const patchPage = usePageStore((s) => s.patchPage);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const coverPickerRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!coverPickerOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (coverPickerRef.current?.contains(event.target as Node)) return;
      setCoverPickerOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCoverPickerOpen(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [coverPickerOpen]);

  const changeIcon = useCallback((newIcon: string) => {
    if (locked) return;
    patchPage(pageId, { icon: newIcon });
    patchActivePageMetadata(pageId, { icon: newIcon });
  }, [locked, pageId, patchPage]);

  const removeIcon = useCallback(() => {
    if (locked) return;
    patchPage(pageId, { icon: undefined });
    patchActivePageMetadata(pageId, { icon: undefined });
  }, [locked, pageId, patchPage]);

  const addIcon = useCallback(() => changeIcon(randomUiCollectionEmoji()), [changeIcon]);

  const changeCover = useCallback((newCover: string) => {
    if (locked) return;
    patchPage(pageId, { cover: newCover });
    patchActivePageMetadata(pageId, { cover: newCover });
  }, [locked, pageId, patchPage]);

  const removeCover = useCallback(() => {
    if (locked) return;
    patchPage(pageId, { cover: undefined });
    patchActivePageMetadata(pageId, { cover: undefined });
  }, [locked, pageId, patchPage]);

  const changeCoverPosition = useCallback((position: number) => {
    if (locked) return;
    patchPage(pageId, { coverPosition: position });
    patchActivePageMetadata(pageId, { coverPosition: position });
  }, [locked, pageId, patchPage]);

  const toggleCoverPicker = useCallback(() => {
    if (!locked) setCoverPickerOpen((open) => !open);
  }, [locked]);

  const selectCover = useCallback((nextCover: string) => {
    changeCover(nextCover);
    setCoverPickerOpen(false);
  }, [changeCover]);

  return { changeIcon, removeIcon, addIcon, changeCover, removeCover, changeCoverPosition, toggleCoverPicker, selectCover, coverPickerOpen, coverPickerRef };
}

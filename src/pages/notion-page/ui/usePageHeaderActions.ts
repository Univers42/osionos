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
import { randomUiCollectionEmoji } from "@/shared/ui/assets/collectionEmoji";
import { PROFILE_HEADER_COVER } from "@/features/slash-commands/model/profileHeaderPreset";

/** Icon + cover actions for the page header, plus the cover-picker popover state. */
export function usePageHeaderActions(pageId: string, locked: boolean) {
  const editPageHeader = usePageStore((s) => s.editPageHeader);
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
    if (!locked) editPageHeader(pageId, { icon: newIcon });
  }, [locked, pageId, editPageHeader]);

  const removeIcon = useCallback(() => {
    if (!locked) editPageHeader(pageId, { icon: undefined });
  }, [locked, pageId, editPageHeader]);

  const addIcon = useCallback(() => changeIcon(randomUiCollectionEmoji()), [changeIcon]);

  /** "Customize header" — scoped to the header BAND only; the page stays a page.
   *  The content mutation is delegated to the open editor via the
   *  osionos:customize-header event so pending typing drafts are flushed first
   *  (mutating content from here would race the editor's debounced commits and
   *  could drop just-typed text). Cover is page metadata — safe to set here. */
  const customizeHeader = useCallback(() => {
    if (locked) return;
    const page = usePageStore.getState().pageById(pageId);
    if (!page) return;
    const first = page.content?.[0];
    if (page.content?.length === 1 && first?.type === "layout" && first.layoutMode === "full_page") return;
    globalThis.dispatchEvent(new CustomEvent("osionos:customize-header", { detail: { pageId } }));
    if (!page.cover) editPageHeader(pageId, { cover: PROFILE_HEADER_COVER });
  }, [locked, pageId, editPageHeader]);

  const changeCover = useCallback((newCover: string) => {
    if (!locked) editPageHeader(pageId, { cover: newCover });
  }, [locked, pageId, editPageHeader]);

  const removeCover = useCallback(() => {
    if (!locked) editPageHeader(pageId, { cover: undefined });
  }, [locked, pageId, editPageHeader]);

  const changeCoverPosition = useCallback((position: number) => {
    if (!locked) editPageHeader(pageId, { coverPosition: position });
  }, [locked, pageId, editPageHeader]);

  const toggleCoverPicker = useCallback(() => {
    if (!locked) setCoverPickerOpen((open) => !open);
  }, [locked]);

  const selectCover = useCallback((nextCover: string) => {
    changeCover(nextCover);
    setCoverPickerOpen(false);
  }, [changeCover]);

  return { changeIcon, removeIcon, addIcon, customizeHeader, changeCover, removeCover, changeCoverPosition, toggleCoverPicker, selectCover, coverPickerOpen, coverPickerRef };
}

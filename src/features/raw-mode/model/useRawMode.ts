/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useRawMode.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseMarkdownToBlocks } from "@/shared/lib/markengine";
import { serializeBlocksToMarkdown } from "@/services/page-actions";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { pageConfigKey, usePageConfigStore } from "@/shared/config/pageConfigStore";

const PREVIEW_DEBOUNCE_MS = 90;

/**
 * Owns the raw-markdown source for a page while raw mode is open.
 *
 * The live text lives in a ref (the textarea is uncontrolled), so keystrokes
 * never trigger a React render — typing stays native-fast on any document size.
 * Only a debounced `previewSource` is pushed to state, so the (heavy) preview
 * re-renders when typing pauses. Save reads the ref, so it always commits the
 * latest text.
 */
export function useRawMode(pageId: string) {
  const updatePageContent = usePageStore((state) => state.updatePageContent);
  const updateConfig = usePageConfigStore((state) => state.updateConfig);
  const userId = useUserStore((state) => state.activeUserId) || "anonymous";

  const initialSource = useMemo(
    () => serializeBlocksToMarkdown(usePageStore.getState().pageById(pageId)?.content ?? []),
    [pageId],
  );
  const sourceRef = useRef(initialSource);
  const dirtyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewSource, setPreviewSource] = useState(initialSource);
  const [dirty, setDirty] = useState(false);

  const edit = useCallback((next: string) => {
    sourceRef.current = next;
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      setDirty(true);
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // The preview parse/render is a low-priority transition: React 19 time-
    // slices it and yields back to the keyboard, so typing stays native-fast
    // even while a large document re-renders in the background.
    debounceRef.current = setTimeout(() => startTransition(() => setPreviewSource(next)), PREVIEW_DEBOUNCE_MS);
  }, []);

  const exit = useCallback(() => { void updateConfig(userId, pageId, { rawMode: false }); }, [pageId, updateConfig, userId]);
  const save = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    updatePageContent(pageId, parseMarkdownToBlocks(sourceRef.current));
    setDirty(false);
    exit();
  }, [exit, pageId, updatePageContent]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return { initialSource, previewSource, edit, save, exit, dirty, configKey: pageConfigKey(userId, pageId) };
}

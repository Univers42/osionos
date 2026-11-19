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
import { serializeBlocksToMarkdown } from "@/services/page-actions";
import { dropRawDraft, keepRawDraft, rawDraftKey, readRawDraft } from "./rawDraftKeep";
import { rawSourceToBlocks } from "./rawSave";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { pageConfigKey, usePageConfigStore } from "@/shared/config/pageConfigStore";

const PREVIEW_DEBOUNCE_MS = 90;

/**
 * On the way out of the document (a reload included) the unsaved text is kept for this tab. A
 * reload never unmounts, so raw mode closing any other way (Exit, Save, the page menu's toggle,
 * another page, a deleted page) ends the draft here: kept, it would come back later as unsaved
 * and its Save would revert the page's newer edits.
 */
function useRawDraftKeep(draftKey: string, sourceRef: { current: string }, dirtyRef: { current: boolean }) {
  useEffect(() => {
    const keep = () => {
      if (dirtyRef.current) keepRawDraft(draftKey, sourceRef.current);
      else dropRawDraft(draftKey);
    };
    globalThis.addEventListener("pagehide", keep);
    return () => {
      globalThis.removeEventListener("pagehide", keep);
      dropRawDraft(draftKey);
    };
  }, [draftKey, sourceRef, dirtyRef]);
}

/** The text raw mode opens on: this tab's kept draft of the page, else the page's blocks. */
function useRestoredRawSource(pageId: string, userId: string) {
  const configKey = pageConfigKey(userId, pageId);
  const draftKey = rawDraftKey(configKey);
  // Read, not taken: StrictMode runs this twice, and a reload before the next edit keeps it again.
  const keptDraft = useMemo(() => readRawDraft(draftKey), [draftKey]);
  const initialSource = useMemo(
    () => keptDraft ?? serializeBlocksToMarkdown(usePageStore.getState().pageById(pageId)?.content ?? []),
    [keptDraft, pageId],
  );
  return { configKey, draftKey, initialSource, isRestored: keptDraft !== null };
}

/**
 * The live text lives in a ref (the textarea is uncontrolled), so keystrokes
 * never trigger a React render — typing stays native-fast on any document size.
 * Only a debounced `previewSource` is pushed to state, so the (heavy) preview
 * re-renders when typing pauses, as a low-priority transition: React 19 time-
 * slices it and yields back to the keyboard, so typing stays native-fast even
 * while a large document re-renders in the background. Save reads the ref, so
 * it always commits the latest text.
 */
function useRawSourceEditing(initialSource: string, isRestored: boolean) {
  const sourceRef = useRef(initialSource);
  const dirtyRef = useRef(isRestored);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewSource, setPreviewSource] = useState(initialSource);
  const [dirty, setDirty] = useState(isRestored);
  const edit = useCallback((next: string) => {
    sourceRef.current = next;
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      setDirty(true);
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => startTransition(() => setPreviewSource(next)), PREVIEW_DEBOUNCE_MS);
  }, []);
  const markSaved = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    dirtyRef.current = false;
    setDirty(false);
  }, []);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);
  return { sourceRef, dirtyRef, previewSource, dirty, edit, markSaved };
}

/** Owns the raw-markdown source for a page while raw mode is open. */
export function useRawMode(pageId: string) {
  const updatePageContent = usePageStore((state) => state.updatePageContent);
  const updateConfig = usePageConfigStore((state) => state.updateConfig);
  const userId = useUserStore((state) => state.activeUserId) || "anonymous";
  const { configKey, draftKey, initialSource, isRestored } = useRestoredRawSource(pageId, userId);
  const { sourceRef, dirtyRef, previewSource, dirty, edit, markSaved } = useRawSourceEditing(initialSource, isRestored);
  useRawDraftKeep(draftKey, sourceRef, dirtyRef);
  const exit = useCallback(() => { void updateConfig(userId, pageId, { rawMode: false }); }, [pageId, updateConfig, userId]);
  const save = useCallback(() => {
    const current = usePageStore.getState().pageById(pageId)?.content ?? [];
    markSaved();
    updatePageContent(pageId, rawSourceToBlocks(sourceRef.current, current));
    exit();
  }, [exit, markSaved, pageId, sourceRef, updatePageContent]);
  // A code pane that remounts (Preview, then Code again) opens on this, not on initialSource:
  // the edits since raw mode opened live only in the ref.
  const readSource = useCallback(() => sourceRef.current, [sourceRef]);
  return { readSource, previewSource, edit, save, exit, dirty, configKey };
}

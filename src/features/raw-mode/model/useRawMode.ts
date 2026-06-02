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

import { useCallback, useState } from "react";
import { parseMarkdownToBlocks } from "@/shared/lib/markengine";
import { serializeBlocksToMarkdown } from "@/services/page-actions";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { pageConfigKey, usePageConfigStore } from "@/shared/config/pageConfigStore";

/**
 * Owns the raw-markdown source for a page while raw mode is open: seeds it from
 * the current blocks once, commits the parsed blocks back on save, and flips the
 * page-config `rawMode` flag off on save/exit.
 */
export function useRawMode(pageId: string) {
  const updatePageContent = usePageStore((state) => state.updatePageContent);
  const updateConfig = usePageConfigStore((state) => state.updateConfig);
  const userId = useUserStore((state) => state.activeUserId) || "anonymous";
  const [source, setSource] = useState(() => serializeBlocksToMarkdown(usePageStore.getState().pageById(pageId)?.content ?? []));
  const [dirty, setDirty] = useState(false);

  const edit = useCallback((next: string) => { setSource(next); setDirty(true); }, []);
  const exit = useCallback(() => { void updateConfig(userId, pageId, { rawMode: false }); }, [pageId, updateConfig, userId]);
  const save = useCallback(() => {
    updatePageContent(pageId, parseMarkdownToBlocks(source));
    setDirty(false);
    exit();
  }, [exit, pageId, source, updatePageContent]);

  return { source, edit, save, exit, dirty, configKey: pageConfigKey(userId, pageId) };
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   publishedView.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { initFormulaEngine } from "@/shared/notion-database-sys/src/lib/engine/bridge";
import { resolvePropertyMap, shownGatedIds } from "@/entities/block/model/visibility";
import { usePageStore } from "@/store/usePageStore";

/**
 * The gated block and cell ids the owner's view of `pageId` shows, sent with a
 * publish so /p/:token shows what the owner saw (#61). The editor fails OPEN
 * when the engine does not load; a publish fails CLOSED: no engine, or content
 * not loaded in this tab, means no gated content goes public.
 *
 * Caveat: a republish from the Published pages list of a page not opened in
 * this tab finds no content, so it drops the gated items the last publish
 * carried; opening the page and republishing brings them back.
 */
export async function shownForPublish(pageId: string): Promise<string[]> {
  const page = usePageStore.getState().pageById(pageId);
  if (!Array.isArray(page?.content)) return [];
  if (!(await initFormulaEngine())) return [];
  return shownGatedIds(page.content, resolvePropertyMap(page.properties as never));
}
